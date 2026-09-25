# Triển khai CSWIND Welder Control App lên Render.com

Ứng dụng này là một app Node.js/Express + PostgreSQL độc lập, hoàn toàn tách khỏi Claude —
một khi đã deploy, nó tự vận hành, không cần Claude nữa. Tài liệu này hướng dẫn từng bước để
đưa app lên Render.com rồi nhúng vào trang SharePoint của CSWIND.

## Điều bạn cần chuẩn bị trước

- Một tài khoản Render.com (miễn phí để tạo, gói trả phí nếu muốn tránh app "ngủ" khi không
  có người dùng — xem phần "Chọn gói" bên dưới).
- Toàn bộ thư mục `cswind-app` (chứa code này) — cần đưa lên GitHub (hoặc GitLab/Bitbucket)
  vì Render deploy trực tiếp từ một Git repository.
- Quyền chỉnh sửa trang SharePoint:
  https://cswind.sharepoint.com/sites/GBCProductionDivision/SitePages/Welder-Control-tool.aspx

## Bước 1 — Đưa code lên GitHub (không cần dùng dòng lệnh)

1. Vào https://github.com và tạo tài khoản nếu chưa có.
2. Bấm nút **+** ở góc trên bên phải → **New repository**.
3. Đặt tên (ví dụ `cswind-welder-app`), chọn **Private** (bắt buộc — repo này chứa dữ liệu
   thật của 260 thợ hàn), rồi bấm **Create repository**.
4. Trên trang repo vừa tạo, bấm **uploading an existing file** (hoặc **Add file** → **Upload
   files**).
5. Mở thư mục `cswind-app` đã giải nén trên máy bạn, chọn **toàn bộ file và thư mục con** bên
   trong (`public`, `src`, `seed_data`, `package.json`, `.gitignore`, `DEPLOY.md` — **không**
   chọn thư mục `node_modules` nếu có, không cần thư mục đó) rồi **kéo thả** vào ô upload của
   GitHub. Trình duyệt Chrome/Edge giữ nguyên cấu trúc thư mục con khi kéo thả.
6. Cuộn xuống, bấm **Commit changes**.

Vậy là xong — không cần cài Git, không cần dòng lệnh.

## Bước 2 — Tạo PostgreSQL database trên Render

1. Vào Render Dashboard → **New** → **PostgreSQL**.
2. Đặt tên (ví dụ `cswind-db`), chọn vùng (Region) gần Việt Nam nhất có sẵn (thường là
   Singapore nếu có).
3. Chọn gói (Free hoặc trả phí — xem ghi chú bên dưới).
4. Tạo xong, Render sẽ cho bạn một **Internal Database URL** — bạn sẽ dùng giá trị này ở bước
   sau (không cần copy tay, Render tự nối khi bạn link database vào Web Service).

## Bước 3 — Tạo Web Service

1. Render Dashboard → **New** → **Web Service**.
2. Chọn repository GitHub bạn vừa tạo ở Bước 1.
3. Cấu hình:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
   - **Region**: cùng vùng với database ở Bước 2 (để tốc độ kết nối nhanh nhất).
4. Mục **Environment Variables** — thêm các biến sau:
   - `DATABASE_URL` → chọn "Add from Database" và trỏ tới `cswind-db` bạn tạo ở Bước 2
     (Render tự điền connection string đúng).
   - `NODE_ENV` → `production`
   - `JWT_SECRET` → một chuỗi ngẫu nhiên, dài, bí mật, dùng để ký phiên đăng nhập. Dùng chuỗi
     sau (đã tạo sẵn riêng cho app này, không dùng lại ở đâu khác):
     `49220916b235b40413bbbcc411ae70ac491045b7dd3023527c4ee55cfc74dd834c60a03f4cd5e2177c2ed0e0a8aaeae9`
     **Không dùng giá trị mặc định trong code** — app sẽ từ chối khởi động ở chế độ production
     nếu bạn quên bước này (đây là một biện pháp bảo vệ có chủ đích).
5. Bấm **Create Web Service**. Render sẽ build và chạy app — theo dõi log để chắc chắn dòng
   cuối là `CSWIND app listening on :<port>` (không có lỗi).
6. Khi deploy xong, Render cho bạn một URL dạng
   `https://cswind-welder-control.onrender.com` (tên tùy bạn đặt cho Web Service). Đây chính
   là URL bạn sẽ dùng ở Bước 5 (nhúng vào SharePoint) và Bước 6 (đặt làm Base URL trong app).

Lần khởi động đầu tiên, app tự tạo bảng dữ liệu (schema) và tự tạo một tài khoản quản trị mặc
định: **username `admin` / password `csw2026`**. Đăng nhập ngay bằng tài khoản này để bắt đầu.

**Quan trọng — đổi mật khẩu ngay sau lần đăng nhập đầu tiên**: vào tab Tài khoản (Accounts),
đổi mật khẩu tài khoản `admin` sang một mật khẩu mạnh hơn, hoặc tạo tài khoản superadmin mới
rồi xoá/hạ quyền tài khoản `admin` mặc định. Mật khẩu `csw2026` chỉ nên dùng để đăng nhập lần
đầu.

## Bước 4 — Dữ liệu 260 thợ hàn (tự động, không cần làm gì)

File `seed_data/welders_extracted.json` (dữ liệu thật của 260 thợ hàn) đã có sẵn trong repo
bạn upload ở Bước 1. Lần khởi động đầu tiên, app tự phát hiện database đang trống và **tự
nhập toàn bộ dữ liệu** — không cần chạy lệnh gì. Chỉ cần đợi 1-2 phút sau khi Web Service báo
"Live", rồi mở URL app và kiểm tra tab Tra cứu (Lookup) có đủ 260 thợ hàn là xong.

**Lưu ý về 2 tài khoản cũ**: dữ liệu cũ có 2 tài khoản "CSW-admin" và "admin" từ hệ thống
Claude Artifact trước đây — hai tài khoản này **không** được nhập vào hệ thống mới vì mật khẩu
của chúng dùng thuật toán mã hoá cũ, không tương thích và mật khẩu gốc (PIN) cũng không còn
được lưu lại được. Hãy dùng tài khoản `admin`/`csw2026` mới để đăng nhập, rồi tạo lại tài
khoản cho từng nhân viên qua tab Tài khoản.

## Bước 5 — Đặt Base URL trong Settings

Đăng nhập vào app (superadmin), vào tab Cài đặt (Settings), đặt **Base URL** = URL thật của
app trên Render (ví dụ `https://cswind-welder-control.onrender.com`). Giá trị này được dùng để
tạo nội dung mã QR cho từng thợ hàn.

## Bước 6 — Nhúng vào trang SharePoint

Trang đích:
https://cswind.sharepoint.com/sites/GBCProductionDivision/SitePages/Welder-Control-tool.aspx

1. Mở trang trên, bấm **Edit** (Chỉnh sửa) ở góc trên bên phải (cần quyền chỉnh sửa trang
   này — nếu bạn không có quyền, nhờ SharePoint site owner thực hiện các bước dưới).
2. Bấm dấu **+** để thêm một web part mới, tìm và chọn **Embed** (web part "Nhúng").
3. Trong ô nhập, dán URL app của bạn dạng iframe, ví dụ:
   ```
   <iframe src="https://cswind-welder-control.onrender.com" width="100%" height="900" style="border:none;"></iframe>
   ```
   (Một số phiên bản SharePoint chỉ cần dán thẳng URL, không cần thẻ `<iframe>` — web part
   Embed sẽ tự nhận diện. Nếu SharePoint chỉ cho dán link chứ không cho HTML, dán trực tiếp
   `https://cswind-welder-control.onrender.com`.)
4. Điều chỉnh chiều cao (height) cho vừa với nội dung trang — 900px là gợi ý ban đầu, có thể
   chỉnh lại sau khi xem thử.
5. Bấm **Publish** (Xuất bản) để lưu trang.

**Lưu ý về bảo mật trình duyệt**: một số trình duyệt (đặc biệt Safari, hoặc Chrome ở chế độ
riêng tư) có thể chặn cookie của iframe nếu domain của app khác domain của SharePoint — đây
gọi là giới hạn "third-party cookie". Nếu nhân viên đăng nhập được nhưng bị đăng xuất ngay khi
tải lại trang khi xem qua SharePoint, đây là nguyên nhân. Cách khắc phục nếu gặp vấn đề này:
mở app trực tiếp ở URL Render (không qua SharePoint) để làm việc, và dùng trang SharePoint chỉ
để có link truy cập nhanh — hoặc báo lại để cấu hình cookie `SameSite=None; Secure` thay cho
cấu hình mặc định hiện tại (`SameSite=Lax`), đánh đổi lấy khả năng hoạt động tốt hơn trong
iframe.

## Bước 7 — Gửi email nhắc nhở tự động qua Gmail (thứ 2 & thứ 6, 8:00)

Mỗi thứ 2 và thứ 6, khoảng 8:00 sáng (giờ Việt Nam), **mỗi entity nhận một email riêng**
(CSW-VN chỉ nhận danh sách thợ hàn CSW-VN, CSW-HQ chỉ nhận của CSW-HQ, ...) liệt kê các chứng chỉ
**sắp / đã hết hạn**, gửi **từ Gmail cá nhân của Quản trị viên cấp cao**. Người nhận của mỗi
entity do **Admin của entity đó** (hoặc Quản trị viên cấp cao) tự điền trong app: tab Quản trị →
chọn entity → mục **"Cài đặt entity"** → "Danh sách email nhận nhắc nhở".

- Entity **không có** chứng chỉ nào cần nhắc → không gửi.
- Entity có chứng chỉ cần nhắc nhưng **chưa có email nhận** → không gửi, và được báo trong email
  tổng hợp.
- Sau mỗi lần chạy, Gmail của Quản trị viên cấp cao nhận **1 email tổng hợp**: entity nào đã gửi
  tới ai, entity nào bị bỏ qua và vì sao.

> **Nâng cấp từ update7/update8:** danh sách email nhận chung cũ tự động được chuyển sang
> **CSW-VN**. Nếu bạn đã dán script ở bản trước, hãy **dán lại toàn bộ code
> `GuiMailNhacNho.gs` mới** (bước 7b) rồi bấm Save — lịch gửi đã bật và mã bí mật giữ nguyên,
> không cần làm lại 7c, 7f.

**Vì sao không gửi thẳng từ app?** Từ 26/09/2025, Render gói Free **chặn mọi kết nối gửi mail
(SMTP, cổng 25/465/587)**. Vì vậy việc gửi được giao cho **Google Apps Script** — một đoạn
script nhỏ chạy miễn phí ngay trong tài khoản Gmail của bạn. Script tự hỏi app danh sách, rồi
tự gửi mail bằng Gmail. Không cần App Password, không cần cron-job.org, không cần nâng gói.

> Nếu trước đây bạn đã tạo cron-job.org theo hướng dẫn cũ, hãy **xoá (Delete) job đó** —
> không còn cần nữa. Và **không** thêm các biến `SMTP_USER` / `SMTP_PASS` trên Render (nếu đã
> có thì xoá đi), tránh việc sau này mail bị gửi 2 lần.

### 7a — Đặt mã bí mật trên Render (1 lần)

Mã bí mật giúp chỉ script của bạn mới lấy được danh sách từ app.

1. Tự nghĩ một chuỗi dài, khó đoán, **chỉ gồm chữ không dấu và số**, ít nhất 24 ký tự
   (ví dụ kiểu `Cswind7Kq2mZx9RtPw4vLb8nYh3`). Ghi tạm ra chỗ an toàn — lát nữa cần dán ở 7c.
2. Vào Render → Web Service `cswind-weldercontrol` → **Environment** → **Add Environment Variable**:
   - Key: `REMINDER_SECRET`
   - Value: chuỗi vừa nghĩ ở trên (nếu đã có biến này từ trước thì giữ nguyên giá trị cũ cũng được)
3. Bấm **Save, rebuild, and deploy**, chờ deploy xong (trạng thái **Live**).

### 7b — Tạo script trong Gmail của bạn

1. Mở trình duyệt, **đăng nhập đúng Gmail cá nhân** sẽ dùng để gửi mail.
2. Vào **https://script.google.com** → bấm **New project** (Dự án mới).
3. Bấm vào chữ **Untitled project** ở góc trên bên trái, đổi tên thành `CSWIND - Gui mail nhac nho`.
4. Trong khung soạn code, **xoá hết** nội dung có sẵn (`function myFunction() {...}`).
5. Mở file `google-apps-script/GuiMailNhacNho.gs` (có trong gói code này, hoặc file Claude gửi
   kèm), copy **toàn bộ** nội dung, dán vào khung soạn code.
6. Bấm biểu tượng **💾 Save** (Lưu) hoặc Ctrl + S.

### 7c — Dán mã bí mật vào script

1. Ở thanh bên trái, bấm biểu tượng **⚙ Project Settings** (Cài đặt dự án).
2. Kéo xuống cuối, mục **Script properties** (Thuộc tính tập lệnh) → bấm **Add script property**:
   - Property: `REMINDER_SECRET`
   - Value: **đúng y chuỗi** đã đặt trên Render ở 7a (không thừa dấu cách)
3. Bấm **Save script properties**.

### 7d — Kiểm tra kết nối & cấp quyền (lần đầu)

1. Bấm biểu tượng **< > Editor** ở thanh bên trái để quay lại màn hình code.
2. Trên thanh công cụ, ô chọn hàm (cạnh nút **▷ Run**) → chọn **`kiemTraKetNoi`** → bấm **▷ Run**.
3. Lần đầu Google sẽ hỏi quyền — đây là bạn cấp quyền cho **chính script của bạn**:
   - Bấm **Review permissions** → chọn tài khoản Gmail của bạn.
   - Nếu hiện "**Google hasn't verified this app**" (Google chưa xác minh ứng dụng này): bấm
     **Advanced** (Nâng cao) → **Go to CSWIND - Gui mail nhac nho (unsafe)**. Cảnh báo này luôn
     hiện với script tự viết, không phải lỗi.
   - Bấm **Allow** (Cho phép). Script xin 3 quyền: kết nối tới dịch vụ bên ngoài (để gọi app),
     gửi email thay bạn, và chạy theo lịch.
4. Xem khung **Execution log** bên dưới. Thành công sẽ thấy:
   `✓ Kết nối app thành công. Nếu chạy gửi bây giờ:` + từng entity: **SẼ GỬI** bao nhiêu chứng
   chỉ tới ai, hoặc **bỏ qua** vì sao.
   - Entity báo **"⚠ … CHƯA có email nhận"**: vào app → tab Quản trị → chọn entity đó → mục
     **Cài đặt entity** → điền email người nhận (cách nhau bằng dấu phẩy) → **Lưu cài đặt**.
   - Nếu báo **410 / script đã cũ**: bạn đang dùng script bản cũ — dán lại code mới (7b).
   - Nếu báo **401 / từ chối mã bí mật**: mã ở 7c không khớp với Render ở 7a — sửa cho giống hệt.
   - Nếu báo **404**: app chưa chạy bản `update9` (hoặc mới hơn) — upload lại code và chờ Render deploy xong.
   - Nếu báo **"Lần thử 1 chưa được…"** rồi sau đó thành công: bình thường — app trên gói Free
     đang "ngủ", mất khoảng 1 phút để thức dậy.

### 7e — Gửi thử 1 email thật

Chọn hàm **`guiMailNhacNho`** → **▷ Run**. Kiểm tra hộp thư của người nhận từng entity (và thư
mục **Spam** lần đầu — nếu mail nằm trong Spam, bấm "Không phải thư rác"), và email **tổng hợp**
trong Gmail của bạn. Mở lại tab Quản trị của app, chọn entity: dòng trạng thái cuối mục nhắc nhở
sẽ hiện **"Lần gửi gần nhất: …"** của entity đó.

### 7f — Bật lịch tự động thứ 2 & thứ 6 (chỉ làm 1 lần)

Chọn hàm **`caiDatLichGui`** → **▷ Run**. Execution log hiện
`✓ Đã bật lịch gửi: thứ 2 và thứ 6, khoảng 8:00 …` là xong. Có thể kiểm tra bằng cách bấm biểu
tượng **⏰ Triggers** ở thanh bên trái — sẽ thấy 2 dòng `guiMailNhacNho` (Weekly, Monday /
Friday, 8am to 9am hoặc tương tự).

Từ giờ, mỗi thứ 2 và thứ 6, Google tự chạy script — **không cần mở máy, không cần mở trình
duyệt**. Google chạy lịch trong khoảng ±15 phút quanh 8:00, nên mail có thể đến trong khoảng
7:45–8:15 (thêm tối đa ~1 phút nếu app đang "ngủ").

### Ghi chú

- **Đổi người nhận**: chỉ cần sửa trong app (Quản trị → chọn entity → Cài đặt entity), không cần
  đụng vào script. Muốn tắt email tổng hợp: sửa `GUI_TONG_HOP: true` thành `false` ở đầu script.
- **Đổi giờ gửi**: sửa số `GIO_GUI: 8` ở đầu script → Save → chạy lại `caiDatLichGui`.
- **Tắt tạm thời**: chạy hàm `huyLichGui`. Bật lại: chạy `caiDatLichGui`.
- **Nếu gửi lỗi** (app không phản hồi, sai mã bí mật…), script tự gửi 1 email cảnh báo
  "⚠ Chưa gửi được email nhắc nhở" về chính Gmail của bạn. Muốn gửi bù thì mở script, chạy
  `guiMailNhacNho`.
- **Giới hạn của Gmail cá nhân**: tối đa khoảng 100 người nhận/ngày qua script — dư sức cho
  danh sách nhắc nhở nội bộ.
- Nút **"Gửi thử ngay (email thật)"** trong app chỉ dùng khi app gửi trực tiếp bằng SMTP (gói
  Render trả phí). Với cách gửi qua Gmail/Apps Script, nút này được ẩn đi — gửi thử bằng cách
  chạy `guiMailNhacNho` trong script như ở 7e.
- **(Chỉ khi nâng Render lên gói trả phí)** có thể cho app tự gửi thẳng qua Gmail: bật xác minh
  2 bước cho Gmail → tạo App Password tại https://myaccount.google.com/apppasswords → thêm trên
  Render `SMTP_USER` = địa chỉ Gmail, `SMTP_PASS` = App Password (16 ký tự). App tự gửi thứ 2 &
  thứ 6 lúc 8:00. Khi đó **phải tắt lịch Apps Script** (`huyLichGui`) để không gửi trùng.

## Bước 8 — Nhiều entity (CSW-VN, CSW-HQ, CSW-TR...)

App giờ hỗ trợ nhiều "entity" (chi nhánh/công ty con) trong cùng một app, mỗi entity có dữ
liệu thợ hàn riêng biệt, nhưng dùng chung một app/đường link/tài khoản đăng nhập.

**Không cần làm gì để bật tính năng này** — khi deploy bản cập nhật, app tự tạo sẵn 7 entity
mặc định: `CSW-VN` (CSW Việt Nam — nơi 260 thợ hàn hiện tại đang nằm), `CSW-HQ`, `CSW-TR`,
`CSW-AM`, `CSW-CN`, `CSW-TW`, `CSW-PT`. Cả 260 thợ hàn hiện có tự động thuộc về `CSW-VN` —
không có dữ liệu nào bị mất hay xáo trộn.

Cách dùng:

- **Tab Tra cứu**: một hàng nút entity (CSW-VN, CSW-HQ, ...) hiện phía trên khung tìm kiếm.
  Bấm vào một entity để chỉ xem thợ hàn thuộc entity đó — số liệu thống kê, danh sách, bộ lọc
  quy trình/công đoạn đều tự lọc theo entity đang chọn.
- **Tab Quản trị**: sau khi đăng nhập, cùng một hàng nút entity hiện ở đầu trang — chọn entity
  nào ở đây cũng đồng bộ với tab Tra cứu (chọn 1 nơi, áp dụng cả 2 nơi). Danh sách tổng, thêm/
  sửa/xoá thợ hàn, nhập Excel... tất cả đều thao tác trên entity đang được chọn.
- **Thêm entity mới**: chỉ tài khoản **Quản trị cấp cao** (superadmin) mới thấy nút "+ Entity
  mới" cuối hàng nút (ở cả 2 tab). Bấm vào, nhập mã (vd `CSW-JP`, chỉ chữ/số/gạch ngang) rồi
  nhập tên hiển thị (vd `CSW Japan`) — entity mới xuất hiện ngay, không cần deploy lại.
  Tài khoản "editor" và "chỉ xem" không thấy nút này (không thể tự thêm entity).
- **Xoá entity tạo nhầm**: cũng chỉ superadmin thấy nút "Xoá entity", và nút này **chỉ xuất
  hiện ở tab Quản trị** (không hiện ở tab Tra cứu, kể cả khi đang đăng nhập superadmin) — bấm
  vào entity muốn xoá để chọn nó, rồi bấm "Xoá entity". Để tránh mất dữ liệu thợ hàn thật, nút này
  **tự động bị khoá (mờ đi)** nếu entity đang chọn còn thợ hàn nào bên trong, hoặc nếu đó là
  entity duy nhất còn lại — phải chuyển hết thợ hàn sang entity khác (sửa trong form thêm/sửa
  thợ hàn, đổi ô "Entity") hoặc xoá hết thợ hàn đó trước, thì nút xoá entity mới bấm được.
  Muốn đổi *tên* một entity đã có (không xoá), báo lại Claude để bổ sung — hiện tại giao diện
  mới hỗ trợ thêm/xoá, chưa hỗ trợ đổi tên.
- **Thêm/sửa thợ hàn**: khi mở form thêm/sửa thợ hàn ở tab Quản trị, có thêm ô chọn "Entity" —
  mặc định là entity đang chọn, có thể đổi sang entity khác ngay trong form nếu cần chuyển thợ
  hàn đó sang entity khác.
- **Mã thợ hàn (ID) vẫn phải là duy nhất trên toàn bộ hệ thống**, không phân biệt theo entity —
  hai entity khác nhau không thể có cùng một mã thợ hàn (vd `CS006` chỉ tồn tại ở một entity).
- **QR code / link riêng của từng thợ hàn không đổi** — vẫn theo mã thợ hàn
  (`.../<mã thợ hàn>`), không phân biệt entity trong đường link.
- **Email nhắc nhở tự động (Bước 7)**: gửi riêng cho từng entity, tới danh sách email của
  chính entity đó (xem Bước 7 và Bước 9).

## Bước 9 — Quản trị viên entity (Admin CSW VN, Admin CSW HQ, ...)

Ngoài 3 cấp quyền cũ (Quản trị cấp cao, Quản trị viên, Chỉ xem), app có thêm cấp **Quản trị viên
entity** — mỗi tài khoản gắn với **một** entity, hiển thị là "Admin CSW VN", "Admin CSW HQ", ...

**Tạo / xoá (chỉ Quản trị viên cấp cao):** tab Quản trị → mục "Quản lý tài khoản quản trị" →
"Cấp tài khoản quản trị mới" → chọn Cấp quyền **Quản trị viên entity** → chọn **Entity** → Tạo tài
khoản. Trong danh sách tài khoản có thể đổi cấp quyền / đổi entity / đặt lại mật khẩu / xoá.

**Admin entity ĐƯỢC làm (chỉ trong entity của mình):**
- Thêm / sửa / xoá thợ hàn, nhập Excel.
- Sửa **Cài đặt entity**: số ngày cảnh báo sắp hết hạn + danh sách email nhận nhắc nhở.
- Tạo / xoá / đặt lại mật khẩu tài khoản **Quản trị viên** và **Chỉ xem** thuộc entity của mình.
- Soạn email nhắc nhở cho entity của mình.
- **Xem** dữ liệu các entity khác (chỉ xem — có dòng thông báo màu vàng, không có nút sửa/xoá).

**Admin entity KHÔNG được làm:**
- Sửa / xoá bất cứ thông tin nào của entity khác (thợ hàn, cài đặt, tài khoản).
- Sửa **Base URL** (cài đặt chung — chỉ Quản trị viên cấp cao).
- Thêm / xoá entity, tạo Quản trị viên cấp cao hoặc Admin entity khác.
- Chuyển thợ hàn sang entity khác.

**Quản trị viên / Chỉ xem gắn với entity:** khi Quản trị viên cấp cao tạo tài khoản
"Quản trị viên" hoặc "Chỉ xem", ô **Entity** có thể để **"Tất cả entity"** (như trước đây) hoặc
chọn một entity — khi đó "Quản trị viên (CSW VN)" chỉ sửa được dữ liệu CSW-VN.

**Số ngày cảnh báo theo từng entity:** mỗi entity có số ngày cảnh báo riêng (mặc định 45 như
trước). Trạng thái "Sắp hết hạn" ở trang Tra cứu, trang riêng thợ hàn, thống kê và email đều tính
theo số ngày của entity chứa thợ hàn đó.

**Xoá entity:** ngoài điều kiện cũ (không còn thợ hàn), giờ còn phải **không còn tài khoản nào
gắn với entity đó** (xoá hoặc đổi entity của các tài khoản đó trước).

## Việc cần làm sau khi deploy xong

- [ ] Đổi mật khẩu tài khoản `admin` mặc định (hoặc tạo superadmin mới, xoá tài khoản mặc định)
- [ ] Import dữ liệu 260 thợ hàn (Bước 4)
- [ ] Đặt Base URL trong Settings (Bước 5)
- [ ] Tạo tài khoản cho từng nhân viên cần chỉnh sửa dữ liệu (vai trò "editor") qua tab Tài khoản
- [ ] Nhúng vào trang SharePoint (Bước 6)
- [ ] Test thử: đăng nhập bằng một tài khoản editor mới tạo, thử thêm/sửa một thợ hàn, xác
      nhận thay đổi lưu lại thật (tải lại trang để chắc chắn)
- [ ] Test thử luồng khách hàng: quét mã QR (hoặc mở link tra cứu) mà không đăng nhập, xác
      nhận xem được thông tin chứng chỉ — quét QR giờ sẽ mở thẳng trang riêng của thợ hàn đó
- [ ] Cấu hình email nhắc nhở tự động qua Gmail (Bước 7), chạy `guiMailNhacNho` để gửi thử
- [ ] Tạo tài khoản Admin cho từng entity (Bước 9) và nhờ họ điền email nhận nhắc nhở trong "Cài đặt entity"
- [ ] Nếu công ty có nhiều chi nhánh (CSW-HQ, CSW-TR...), thử bấm qua lại các nút entity ở tab
      Tra cứu/Quản trị (Bước 8) để quen với cách chuyển đổi

## Ghi chú về gói Render (Free vs trả phí)

Gói **Free** của Render sẽ tự "ngủ" (sleep) sau ~15 phút không có ai truy cập, và mất khoảng
30-60 giây để "thức dậy" ở lượt truy cập tiếp theo — nếu nhân viên quét mã QR và phải chờ, đây
là nguyên nhân.

**⚠ Quan trọng — Database gói Free chỉ sống 30 ngày**: theo tài liệu của Render
(https://render.com/docs/free), database PostgreSQL gói Free **hết hạn 30 ngày sau khi tạo**;
sau đó có 14 ngày để nâng cấp, quá hạn Render **xoá hẳn database cùng toàn bộ dữ liệu**. Vào
Render Dashboard → database của app để xem ngày tạo / cảnh báo hết hạn. Vì app đang chứa dữ liệu
thật, nên nâng **Database** lên gói trả phí thấp nhất trước hạn (kiểm tra giá trên
render.com/pricing). Web Service có thể giữ gói Free — email nhắc nhở qua Gmail (Bước 7) vẫn
chạy bình thường trên gói Free.

## Nếu gặp lỗi khi deploy

- **App không khởi động, log báo "FATAL: set a real JWT_SECRET..."**: bạn chưa đặt biến môi
  trường `JWT_SECRET` ở Bước 3 — quay lại thêm.
- **App khởi động nhưng không kết nối được database**: kiểm tra lại biến `DATABASE_URL` đã
  được link đúng tới database ở Bước 2 chưa (vào tab Environment của Web Service để xem).
- **Trang trắng khi mở URL app**: xem log của Web Service trên Render Dashboard để tìm lỗi cụ
  thể; thường là do build chưa xong hoặc lỗi cú pháp — báo lại thông tin lỗi trong log để được
  hỗ trợ.
