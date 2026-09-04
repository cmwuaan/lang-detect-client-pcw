'use strict';

/**
 * Cửa chặn Windows 7: đọc bảng import của một file PE và từ chối artifact không
 * nạp được trên Win7.
 *
 * Dùng chung cho CẢ hai bản triển khai (Rust ở src/, C++ ở src-cpp/) vì nó chỉ
 * đọc binary — không quan tâm ngôn ngữ nào sinh ra. Cũng chạy được độc lập trên
 * bất kỳ .node nào khác:
 *
 *   node scripts/win7-guard.js <đường-dẫn.node> [...]
 *
 * VÌ SAO CẦN: Windows resolve toàn bộ import ngay lúc LoadLibrary. Thiếu một DLL
 * hay một export là hỏng cả file — `require()` ném lỗi, và tầng trên chỉ nói
 * được 'native-binding-missing'. Đọc bảng import tại máy build phát hiện chuyện
 * đó trong vài giây, thay vì sau khi đã bê 87MB sang máy ảo.
 */

const fs = require('fs');

/** Đọc bảng import của một file PE. Trả về { 'kernel32.dll': ['...'], ... }. */
function peImports(file) {
	const d = fs.readFileSync(file);
	// Gọi nhầm với Mach-O/ELF thì lỗi offset ở dưới rất khó hiểu; chặn sớm.
	if (d.readUInt16LE(0) !== 0x5a4d) throw new Error('Không phải file PE: ' + file);
	const pe = d.readUInt32LE(0x3c);
	const nsec = d.readUInt16LE(pe + 6);
	const optSize = d.readUInt16LE(pe + 20);
	const opt = pe + 24;
	const pe32Plus = d.readUInt16LE(opt) === 0x20b;
	const impRva = d.readUInt32LE(opt + (pe32Plus ? 112 : 96) + 8);

	const secs = [];
	for (let i = 0; i < nsec; i++) {
		const b = opt + optSize + 40 * i;
		secs.push({
			va: d.readUInt32LE(b + 12),
			size: Math.max(d.readUInt32LE(b + 8), d.readUInt32LE(b + 16)),
			raw: d.readUInt32LE(b + 20),
		});
	}
	function off(rva) {
		for (const s of secs) {
			if (rva >= s.va && rva < s.va + s.size) return s.raw + (rva - s.va);
		}
		return -1;
	}
	function str(at) {
		return d.slice(at, d.indexOf(0, at)).toString('latin1');
	}

	const out = {};
	for (let i = off(impRva); ; i += 20) {
		const oft = d.readUInt32LE(i);
		const nameRva = d.readUInt32LE(i + 12);
		const first = d.readUInt32LE(i + 16);
		if (nameRva === 0) break;

		const dll = str(off(nameRva));
		out[dll] = [];
		const step = pe32Plus ? 8 : 4;
		for (let t = off(oft || first); ; t += step) {
			const lo = d.readUInt32LE(t);
			const hi = pe32Plus ? d.readUInt32LE(t + 4) : 0;
			if (lo === 0 && hi === 0) break;
			const isOrdinal = pe32Plus ? (hi & 0x80000000) !== 0 : (lo & 0x80000000) !== 0;
			// Import theo ordinal không có tên; bỏ qua, danh sách cấm đều theo tên.
			if (!isOrdinal) out[dll].push(str(off(lo & 0x7fffffff) + 2));
		}
	}
	return out;
}

/**
 * Luật cấm. Hai luật đầu là của bản Rust: `std` từ 1.78 import tĩnh API chỉ có
 * trên Windows 8/10. Luật thứ ba là của bản C++: nếu quên đặt CRT link tĩnh thì
 * .node đòi bộ VC++ redistributable trên máy người dùng.
 *
 * `dllPattern` khớp theo tiền tố, viết thường — tên DLL trong bảng import không
 * cố định hoa/thường, và VC++ runtime có nhiều biến thể số phiên bản.
 */
const FORBIDDEN = [
	{
		dllPattern: 'api-ms-win-core-synch-l1-2-0',
		fn: null,
		why: 'API set chỉ có từ Windows 8 (thread parking của std Rust >= 1.78)',
	},
	{
		dllPattern: 'bcryptprimitives',
		fn: 'ProcessPrng',
		why: 'export chỉ có từ Windows 10 (seed random của std Rust >= 1.78)',
	},
	{
		dllPattern: 'vcruntime',
		fn: null,
		why: 'CRT của MSVC chưa link tĩnh — .node sẽ đòi VC++ redistributable',
	},
	{
		dllPattern: 'msvcp',
		fn: null,
		why: 'thư viện chuẩn C++ chưa link tĩnh — .node sẽ đòi VC++ redistributable',
	},
];

/** Ném lỗi nếu artifact không chạy được trên Win7. In danh sách import nếu đạt. */
function assertWin7Safe(file, hint) {
	const imports = peImports(file);
	const bad = [];

	for (const rule of FORBIDDEN) {
		for (const dll of Object.keys(imports)) {
			if (dll.toLowerCase().indexOf(rule.dllPattern) !== 0) continue;
			if (rule.fn && imports[dll].indexOf(rule.fn) === -1) continue;
			bad.push(dll + (rule.fn ? '!' + rule.fn : '') + ' — ' + rule.why);
		}
	}

	if (bad.length) {
		throw new Error(
			'Artifact KHÔNG chạy được trên Windows 7:\n  ' + bad.join('\n  ') + '\n\n' + hint
		);
	}

	console.log('[zlang] kiểm tra Windows 7: đạt (' + Object.keys(imports).join(', ') + ')');
}

module.exports = { peImports, assertWin7Safe, FORBIDDEN };

// Chạy trực tiếp: soi bất kỳ .node/.dll nào, kể cả của module khác.
if (require.main === module) {
	const files = process.argv.slice(2);
	if (!files.length) {
		console.error('Cách dùng: node scripts/win7-guard.js <file.node> [...]');
		process.exit(2);
	}
	let failed = 0;
	for (const f of files) {
		try {
			assertWin7Safe(f, 'Xem README §Môi trường.');
			console.log('  ĐẠT   ' + f);
		} catch (err) {
			failed++;
			console.error('  HỎNG  ' + f + '\n' + err.message.replace(/^/gm, '        '));
		}
	}
	process.exit(failed ? 1 : 0);
}
