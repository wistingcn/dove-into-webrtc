《深入WebRTC直播技术》示例代码，示例支持部署在Mac或者linux系统，使用Chrome浏览器打开页面

- chroma-keying , 采集本地媒体流,结合Canvas实现虚拟背景.
- media_constraints,打印当前浏览器的媒体约束
- peerconnection ,ICE建连过程
- rtpmedia, 媒体流交换,实现了以下功能:
   - 动态设置视频码率
   - vp8/vp9/h264编码切换
   - 将chroma-keying实现的虚拟背景视频传输到对等端
- signaling,使用Typescript + Express + Socket.IO实现了一个完整的信令服务器
   - 能够同时支撑多个WebRTC通话环境，即多个房间，房间之间互不影响.
   - 每个房间参与人数不受限制.
   - 支持可靠信令传输。能够准确知道信令是否发送成功，如果因为网络故障等原因导致发送失败，能够收到通知，并支持进行重试。
   - 实现了信令客户端
