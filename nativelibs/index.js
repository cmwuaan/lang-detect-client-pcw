/**
 * Bản thu nhỏ của `nativelibs` (https://zalogit2.zing.vn/zalo-pc/nativelibs),
 * giữ ĐÚNG hợp đồng của repo thật: mỗi native module là một hàm, gọi mới
 * require — module nào không dùng thì không nạp .node của nó.
 *
 *   const nativelibs = require('nativelibs');
 *   const zlang = nativelibs.zlang();
 *
 * Repo này chỉ có `zlang`. Khi đưa sang zalo-pc-app thì copy thư mục
 * nativelibs/zlang vào native/nativelibs/zlang và thêm một dòng vào index.js
 * của repo thật — không cần sửa gì ở phía app.
 */

module.exports = {
	zlang: function () {
		return require('./zlang/index.js');
	},
};
