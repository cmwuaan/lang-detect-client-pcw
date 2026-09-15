/*
 * Windows backend: Extended Linguistic Services, "Microsoft Language Detection".
 *
 * Implements the ABI declared in zlang_bridge.h. Available since Windows 7; no
 * model files, no network, no COM initialisation required.
 *
 * The critical difference from the macOS backend is what the OS gives back:
 * ELS returns a RANKED LIST WITH NO SCORES. Every confidence written here is
 * ZLANG_NO_CONFIDENCE, and the ranking lives in the array order alone. Do not
 * invent a number from the rank — that is data the OS never provided.
 *
 * NOT YET BUILT ON A REAL WINDOWS MACHINE. The struct layouts come from the
 * SDK headers so they cannot drift, but field and function names need one real
 * compile to confirm.
 */

/* Must precede elssrvc.h: makes DEFINE_GUID emit a definition for
   ELS_GUID_LANGUAGE_DETECTION in this object file, instead of just a
   declaration that would need an extra import library to resolve. */
#include <initguid.h>

#include <windows.h>

#include <elscore.h>
#include <elssrvc.h>

#include <wchar.h>

#include "zlang_bridge.h"

/*
 * ELS speaks UTF-16; our ABI speaks UTF-8. Both conversions go through the
 * Win32 converters rather than hand-rolled loops, so surrogate pairs and
 * invalid sequences are handled by the OS.
 */

/*
 * Acquires the language detection service.
 *
 * On success the caller owns `*services` and must release it with
 * MappingFreeServices. Returns an ZLANG_ERR_* code on failure.
 */
static int32_t acquire_service(PMAPPING_SERVICE_INFO *services)
{
    MAPPING_ENUM_OPTIONS options;
    DWORD count = 0;
    HRESULT hr;

    ZeroMemory(&options, sizeof(options));
    options.Size = sizeof(MAPPING_ENUM_OPTIONS);
    /* Ask for exactly one service by GUID, rather than enumerating every
       installed ELS service and picking one by name. */
    options.pGuid = (GUID *)&ELS_GUID_LANGUAGE_DETECTION;

    *services = NULL;
    hr = MappingGetServices(&options, services, &count);

    if (FAILED(hr) || *services == NULL || count == 0)
    {
        /* The service can be absent or disabled by policy — that is an
           availability problem, not a backend error. */
        if (*services != NULL)
        {
            MappingFreeServices(*services);
            *services = NULL;
        }
        return ZLANG_ERR_UNAVAILABLE;
    }

    return 0;
}

/*
 * Writes one UTF-16 tag into the fixed-size `tag` field as UTF-8.
 *
 * Returns true when the tag fit. A tag that does not fit is skipped by the
 * caller rather than truncated: a truncated tag would read as a different,
 * valid language.
 */
static bool write_tag(const WCHAR *wide_tag, int wide_len, ZlangHypothesis *slot)
{
    int written;

    /* Zero the whole field first: guarantees NUL termination and leaves no
       stale bytes behind the terminator. */
    ZeroMemory(slot->tag, sizeof(slot->tag));

    if (wide_len <= 0)
    {
        return false;
    }

    /* Leave room for the terminator that ZeroMemory already placed. */
    written = WideCharToMultiByte(CP_UTF8, 0, wide_tag, wide_len, slot->tag,
                                  (int)sizeof(slot->tag) - 1, NULL, NULL);

    return written > 0;
}

bool zlang_bridge_available(void)
{
    PMAPPING_SERVICE_INFO services = NULL;

    if (acquire_service(&services) != 0)
    {
        return false;
    }

    MappingFreeServices(services);
    return true;
}

const char *zlang_bridge_score_kind(void)
{
    /* ELS ranks but never scores. See the note at the top of this file. */
    return "rank";
}

int32_t zlang_bridge_detect(const char *utf8_text, uint32_t max_results, ZlangHypothesis *out)
{
    PMAPPING_SERVICE_INFO services = NULL;
    MAPPING_PROPERTY_BAG bag;
    WCHAR *wide_text = NULL;
    int wide_len = 0;
    uint32_t capacity;
    uint32_t written = 0;
    int32_t status;
    HRESULT hr;

    if (utf8_text == NULL || out == NULL)
    {
        return ZLANG_ERR_BAD_ARG;
    }

    capacity = max_results;
    if (capacity < 1)
    {
        capacity = 1;
    }
    if (capacity > ZLANG_MAX_RESULTS)
    {
        capacity = ZLANG_MAX_RESULTS;
    }

    /* Empty input is a valid question with an empty answer — do not bother the
       service, and do not report an error. */
    if (utf8_text[0] == '\0')
    {
        return 0;
    }

    /* Measure first, then convert: avoids guessing at the expansion factor. */
    wide_len = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8_text, -1, NULL, 0);
    if (wide_len <= 0)
    {
        /* Invalid UTF-8 reaches here; the Rust layer guarantees NUL-free input
           but not well-formedness. */
        return ZLANG_ERR_ENCODING;
    }

    /* No length cap: the allocation is proportional to text the caller already
       holds in memory, and clamping here would make MultiByteToWideChar below
       fail with "insufficient buffer" on perfectly valid input. */
    wide_text = (WCHAR *)HeapAlloc(GetProcessHeap(), 0, (SIZE_T)wide_len * sizeof(WCHAR));
    if (wide_text == NULL)
    {
        return ZLANG_ERR_BACKEND;
    }

    if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8_text, -1, wide_text, wide_len) <= 0)
    {
        HeapFree(GetProcessHeap(), 0, wide_text);
        return ZLANG_ERR_ENCODING;
    }

    status = acquire_service(&services);
    if (status != 0)
    {
        HeapFree(GetProcessHeap(), 0, wide_text);
        return status;
    }

    ZeroMemory(&bag, sizeof(bag));
    bag.Size = sizeof(MAPPING_PROPERTY_BAG);

    /* wide_len counts the terminator returned by MultiByteToWideChar(-1);
       MappingRecognizeText wants the length without it.
       dwIndex = 0: read from the start. Reading from an offset is a V3 option. */
    hr = MappingRecognizeText(services, wide_text, (DWORD)(wide_len - 1), 0, NULL, &bag);

    if (FAILED(hr))
    {
        MappingFreeServices(services);
        HeapFree(GetProcessHeap(), 0, wide_text);
        return ZLANG_ERR_BACKEND;
    }

    /*
     * Result shape: prgResultRanges[0].pData is a sequence of NUL-terminated
     * UTF-16 tags terminated by an extra NUL (MULTI_SZ), already ordered most
     * likely first. dwDataSize is in BYTES, not code units.
     *
     * An empty list is a legitimate answer for text too short to decide.
     */
    if (bag.dwRangesCount > 0 && bag.prgResultRanges != NULL && bag.prgResultRanges[0].pData != NULL)
    {
        const WCHAR *cursor = (const WCHAR *)bag.prgResultRanges[0].pData;
        size_t remaining = (size_t)bag.prgResultRanges[0].dwDataSize / sizeof(WCHAR);

        while (written < capacity && remaining > 0 && *cursor != L'\0')
        {
            size_t tag_len = wcsnlen(cursor, remaining);

            /* Empty string = the second NUL of the MULTI_SZ: end of list. */
            if (tag_len == 0)
            {
                break;
            }

            /*
             * wcsnlen returns `remaining` when it finds no NUL at all, which
             * means the buffer ended mid-tag. Emitting it would hand up a tag
             * the service never finished writing — and a truncated tag reads as
             * a different, valid language. Stop instead.
             */
            if (tag_len >= remaining)
            {
                break;
            }

            if (write_tag(cursor, (int)tag_len, &out[written]))
            {
                /* ELS gives no score. Writing NaN here is what makes the Rust
                   layer produce `null` instead of a fabricated number. */
                out[written].confidence = ZLANG_NO_CONFIDENCE;
                written++;
            }

            /* tag_len < remaining is guaranteed above, so this cannot underflow. */
            cursor += tag_len + 1;
            remaining -= tag_len + 1;
        }
    }

    MappingFreePropertyBag(&bag);
    MappingFreeServices(services);
    HeapFree(GetProcessHeap(), 0, wide_text);

    return (int32_t)written;
}
