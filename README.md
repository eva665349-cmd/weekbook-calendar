
# Weekbook Calendar

一个可直接使用的响应式周记 / 月历应用。它是纯静态网页，不依赖 ChatGPT、不需要登录或后端；记录保存在当前浏览器的 `localStorage` 中。

## 在线地址

https://eva665349-cmd.github.io/weekbook-calendar/

## 发布到 GitHub Pages

本仓库当前从 `main` 分支根目录发布：

1. 打开仓库的 **Settings → Pages**。
2. 在 **Build and deployment** 中将 Source 设为 **Deploy from a branch**。
3. Branch 选择 **main**，文件夹选择 **/ (root)**，点击 **Save**。
4. 发布完成后访问上方在线地址。

每次更新 `main` 分支后，GitHub Pages 会自动重新发布。

## 本地预览

在项目目录启动任意静态文件服务器，例如：

```sh
python3 -m http.server 4173
```

然后访问 `http://localhost:4173`。

## 数据说明

- 数据只保存在当前浏览器和当前设备中，不会上传到 GitHub。
- 清除浏览器网站数据会同时删除记录。
- 不同设备不会自动同步；如果以后需要同步，可以再增加导入 / 导出或云端存储。
