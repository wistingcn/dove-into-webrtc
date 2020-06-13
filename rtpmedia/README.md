该实例运行于NodeJS环境，在Windows/Mac/Linux系统下都可以正常运行，在运行以下命令前，需要先从GitHub上获取项目代码。
- 动态设置视频码率
- vp8/vp9/h264编码切换
- 将chroma-keying实现的虚拟背景视频传输到对等端

## 在项目根目录下安装依赖包：
```bash
# 该命令安装依赖包：http-serve/websocket/yargs
cnpm i
```
## 启动信令服务：
```bash
# 如果在本机运行，则不建议使用证书：
node peerserver.js 
# 如果运行于服务器上，建议使用Https证书：
node peerserver.js --cert <证书文件路径> --key <key文件路径>
```
## 打开一个新的终端，启动Http服务器：
```bash
# http-serve是一个简单的Http服务器，不建议在生产环境中使用
# http-serve默认启动端口8080，可以使用-p参数修改端口
npx http-serve .
```
## 打开两个Chrome浏览器窗口，分别输入：
```bash
http://localhost:8080/
```
