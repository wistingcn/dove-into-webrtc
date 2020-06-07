class ChromaKey {
  capStream=null;
  paused = false;
  constructor() {
  }

  getImageFrame() {
    const backgroundImg = new Image();
    backgroundImg.src = 'media/beach.jpg';

    backgroundImg.onload = () => {
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = this.width;
      imageCanvas.height = this.height;

      const ctx = imageCanvas.getContext('2d');
      ctx.drawImage(backgroundImg,0,0,this.width,this.height);

      this.imageFrame = ctx.getImageData(0, 0, this.width, this.height);

      this.timerCallback();
    }
  }

  doLoad() {
    this.video = document.getElementById("local_video");

    this.c1 = document.createElement('canvas');
    this.ctx1 = this.c1.getContext("2d");

    this.c2 = document.createElement('canvas');
    this.ctx2 = this.c2.getContext("2d");

    this.width = this.c1.width = this.c2.width = this.video.videoWidth;
    this.height = this.c1.height = this.c2.height = this.video.videoHeight;

    this.capStream = this.c2.captureStream();
    this.getImageFrame();
  }

  timerCallback(){
      if (this.video.paused || this.video.ended) {
        return;
      }
      this.computeFrame();
      setTimeout(() => {
        if (!this.paused){
          this.timerCallback();
        }
      }, 50);
  }

  computeFrame() {
    this.ctx1.drawImage(this.video, 0, 0, this.width, this.height);
    let frame = this.ctx1.getImageData(0, 0, this.width, this.height);
    let l = frame.data.length / 4;

    for (let i = 0; i < l; i++) {
      let r = frame.data[i * 4 + 0];
      let g = frame.data[i * 4 + 1];
      let b = frame.data[i * 4 + 2];

      if ( r > 150 && g > 150 && b > 150) {
        frame.data[i * 4 + 0] = this.imageFrame.data[i*4 + 0];
        frame.data[i * 4 + 1] = this.imageFrame.data[i*4 + 1];
        frame.data[i * 4 + 2] = this.imageFrame.data[i*4 + 2];
      }
    }
    this.ctx2.putImageData(frame, 0, 0);
  }
}
