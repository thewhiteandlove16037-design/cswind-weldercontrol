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

## Việc cần làm sau khi deploy xong

- [ ] Đổi mật khẩu tài khoản `admin` mặc định (hoặc tạo superadmin mới, xoá tài khoản mặc định)
- [ ] Import dữ liệu 260 thợ hàn (Bước 4)
- [ ] Đặt Base URL trong Settings (Bước 5)
- [ ] Tạo tài khoản cho từng nhân viên cần chỉnh sửa dữ liệu (vai trò "editor") qua tab Tài khoản
- [ ] Nhúng vào trang SharePoint (Bước 6)
- [ ] Test thử: đăng nhập bằng một tài khoản editor mới tạo, thử thêm/sửa một thợ hàn, xác
      nhận thay đổi lưu lại thật (tải lại trang để chắc chắn)
- [ ] Test thử luồng khách hàng: quét mã QR (hoặc mở link tra cứu) mà không đăng nhập, xác
      nhận xem được thông tin chứng chỉ

## Ghi chú về gói Render (Free vs trả phí)

Gói **Free** của Render sẽ tự "ngủ" (sleep) sau ~15 phút không có ai truy cập, và mất khoảng
30-50 giây để "thức dậy" ở lượt truy cập tiếp theo — nếu nhân viên quét mã QR và phải chờ, đây
là nguyên nhân. Database Free của Render cũng có giới hạn thời gian lưu trữ (thường bị xoá sau
90 ngày nếu không nâng cấp). Nếu app này sẽ được dùng thường xuyên trong công việc thực tế của
CSWIND (không chỉ để thử nghiệm), nên nâng cấp Web Service và Database lên gói trả phí thấp
nhất (Starter, khoảng $7/tháng mỗi loại tại thời điểm viết tài liệu này — kiểm tra giá hiện tại
trên render.com/pricing vì giá có thể thay đổi) để tránh tình trạng "ngủ" và mất dữ liệu.

## Nếu gặp lỗi khi deploy

- **App không khởi động, log báo "FATAL: set a real JWT_SECRET..."**: bạn chưa đặt biến môi
  trường `JWT_SECRET` ở Bước 3 — quay lại thêm.
- **App khởi động nhưng không kết nối được database**: kiểm tra lại biến `DATABASE_URL` đã
  được link đúng tới database ở Bước 2 chưa (vào tab Environment của Web Service để xem).
- **Trang trắng khi mở URL app**: xem log của Web Service trên Render Dashboard để tìm lỗi cụ
  thể; thường là do build chưa xong hoặc lỗi cú pháp — báo lại thông tin lỗi trong log để được
  hỗ trợ.
