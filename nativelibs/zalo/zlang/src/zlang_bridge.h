#ifndef ZLANG_BRIDGE_H
#define ZLANG_BRIDGE_H

#include <math.h>
#include <stdbool.h>
#include <stdint.h>

/* Maximum length of a BCP 47 language tag, including the null terminator. */
#define ZLANG_TAG_CAP 24

/* Maximum number of results returned by the bridge. */
#define ZLANG_MAX_RESULTS 16

/*
 * Used when the backend does not provide a confidence score.
 * NaN distinguishes "no score" from a valid confidence of 0.0.
 */
#define ZLANG_NO_CONFIDENCE ((double)NAN)

/*
 * A detected language hypothesis.
 *
 * Layout:
 *   0..23  - BCP 47 language tag
 *   24..31 - confidence score
 */
typedef struct
{
    /* BCP 47 language tag. Empty string means unused slot. */
    char tag[ZLANG_TAG_CAP];

    /*
     * Confidence score in [0, 1], or ZLANG_NO_CONFIDENCE
     * when the backend only provides ranking.
     */
    double confidence;

} ZlangHypothesis;

/*
 * Error codes returned by zlang_bridge_detect().
 * Non-negative values indicate the number of results written.
 */
enum
{
    ZLANG_ERR_BAD_ARG = -1,
    ZLANG_ERR_UNAVAILABLE = -2,
    ZLANG_ERR_BACKEND = -3,
    ZLANG_ERR_ENCODING = -4
};

/* Returns whether the OS backend is available. */
bool zlang_bridge_available(void);

/*
 * Returns the score type:
 *   "probability" - backend provides confidence scores.
 *   "rank"        - backend only provides result ordering.
 *
 * Returns a static string; caller must not free it.
 */
const char *zlang_bridge_score_kind(void);

/*
 * Detects languages in UTF-8 text.
 *
 * Results are written to the caller-provided buffer.
 * max_results is capped at ZLANG_MAX_RESULTS.
 *
 * Returns:
 *   >= 0 - number of results written.
 *   < 0  - one of the ZLANG_ERR_* codes.
 */
int32_t zlang_bridge_detect(const char *utf8_text,
                            uint32_t max_results,
                            ZlangHypothesis *out);

#endif /* ZLANG_BRIDGE_H */