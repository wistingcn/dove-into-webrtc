# 基于Ionic4的WebRTC移动应用
* 支持WebRTC音视频通话
* 基于数据通道的文字聊天
* 支持Android和IOS

## 编译
```
npm i -g cordova
npm i -g native-run
npm i -g cordova-res
npm install -g @ionic/cli
cnpm install

```
执行以下命令检查原生编译环境是否成功安装：
```
cordova requirements
```

## Android
连接Android手机,执行:
```
./build_android.sh
```
该命令编译成功后,将在手机上打开应用程序,程序需要摄像头/麦克风权限,请在设置里查看权限是否成功设置.

## IOS
连接iPhone手机，或者在模拟器中运行。
```
./build_ios.sh
```
在Xcode中打开工程platforms/ios,执行编译。

## 运行信令服务

```
启动allinone目录里的信令服务.
```

## 使用
目前只支持从PC浏览器发起WebRTC连接:
* 使用浏览器打开信令服务器地址
```
https://[信令服务器]/
```
* 在浏览器输入用户名
* 在手机输入服务器域名
* 在PC浏览器点击ionic用户名,建立WebRTC连接
* 开始视频及文字聊天
