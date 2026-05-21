---
inclusion: auto
---

# iOS Build — Các lỗi đã gặp và cách phòng tránh

Tài liệu này ghi lại các lỗi build iOS trên GitHub Actions đã xảy ra và cách fix. Áp dụng cho cả workflow `build-ios.yml` (signed) và `build-ios-unsigned.yml`.

## 1. YAML syntax error khi dùng Python inline trong workflow

**Lỗi:** `could not find expected ':'`  
**Nguyên nhân:** Dùng `python3 -c "..."` multi-line trong YAML block scalar (`run: |`). YAML parser nhầm Python code (ví dụ `import re`) là YAML key.  
**Fix:** Dùng heredoc:
```yaml
python3 - "$ARG" <<'PYEOF'
import re, sys
# code here
PYEOF
```
**Quy tắc:** KHÔNG dùng `python3 -c` multi-line trong workflow. Luôn dùng heredoc (`<<'PYEOF'`).

---

## 2. iOS Platform Not Installed (storyboard compilation)

**Lỗi:** `iOS 18.1 Platform Not Installed` khi compile SplashScreen.storyboard.  
**Nguyên nhân:** Runner `macos-15` có Xcode 16.1 với SDK (headers) nhưng iOS platform chưa download. Dùng `|| true` khiến download fail silently.  
**Fix:** Chạy `xcodebuild -downloadPlatform iOS` KHÔNG có `|| true`:
```yaml
- name: Select Xcode
  run: |
    sudo xcode-select -s /Applications/Xcode_16.1.app/Contents/Developer
    xcodebuild -version
    xcodebuild -downloadPlatform iOS
    xcodebuild -showsdks | grep iphoneos
```
**Quy tắc:** Bước download platform PHẢI thành công. KHÔNG dùng `|| true`.

---

## 3. `-destination` flag conflict với `-sdk`

**Lỗi:** `Unable to find a destination matching the provided destination specifier: { generic:1, platform:iOS }`  
**Nguyên nhân:** Dùng cả `-destination "generic/platform=iOS"` lẫn `-sdk iphoneos`. Khi platform chưa registered, `-destination` fail.  
**Fix:** Chỉ dùng `-sdk iphoneos`, bỏ `-destination`:
```yaml
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -archivePath build/App.xcarchive \
  -sdk iphoneos \
  ...
```
**Quy tắc:** `-sdk iphoneos` là đủ cho device build. KHÔNG dùng `-destination` cùng lúc.

---

## 4. Metro bundling fail — missing native package

**Lỗi:** `Unable to resolve module react-native-google-cast`  
**Nguyên nhân:** `ChromecastProvider.ts` import `react-native-google-cast`. Mặc dù wrap trong `try/catch`, Metro resolve TẤT CẢ imports tại bundle time (không phải runtime).  
**Fix:** Tạo stub package tại `stubs/react-native-google-cast/` và config Metro:
```js
// metro.config.js
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "stubs"),
];
```
**Quy tắc:** Optional native packages chưa cài PHẢI có stub trong `stubs/`. `try/catch` quanh `require()` KHÔNG ngăn Metro resolve.

---

## 5. Bridging Header import sai (`-Swift.h`)

**Lỗi:** `'VibeVax-Swift.h' file not found` trong bridging header.  
**Nguyên nhân:** `#import "VibeVax-Swift.h"` trong bridging header. File `-Swift.h` là generated (Swift → ObjC), chỉ import trong `.m`/`.mm`.  
**Fix:** Plugin `withFixBuildErrors.js` tự động xóa. Workflow step backup dùng `sed`.  
**Quy tắc:** KHÔNG import `*-Swift.h` trong bridging header — tạo circular dependency.

---

## 6. Duplicate ObjC selector (notification method)

**Lỗi:** `conflicts with previous declaration with the same Objective-C selector`  
**Nguyên nhân:** Method `didRegisterForRemoteNotificationsWithDeviceToken` khai báo ở cả AppDelegate.mm lẫn Swift extension.  
**Fix:** Plugin `withFixBuildErrors.js` detect và xóa duplicate.  
**Quy tắc:** Mỗi ObjC selector chỉ khai báo MỘT LẦN trong project.

---

## Checklist trước khi sửa workflow

- [ ] Validate YAML: `python -c "import yaml; yaml.safe_load(open('file.yml'))"`
- [ ] Không dùng `python3 -c` multi-line — dùng heredoc
- [ ] `xcodebuild -downloadPlatform iOS` không có `|| true`
- [ ] Không dùng `-destination` cùng với `-sdk`
- [ ] Native packages optional phải có stub trong `stubs/`
- [ ] Plugin `withFixBuildErrors` ở cuối danh sách plugins trong `app.json`
