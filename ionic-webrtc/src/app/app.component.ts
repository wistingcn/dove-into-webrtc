import { Component } from '@angular/core';

import { Platform } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';

declare var cordova;

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})
export class AppComponent {
  constructor(
    private platform: Platform,
    private splashScreen: SplashScreen,
    private statusBar: StatusBar
  ) {
    this.initializeApp();
  }

  initializeApp() {
    this.platform.ready().then(() => {
      this.statusBar.styleDefault();
      this.splashScreen.hide();
      if (this.platform.is('ios')) {
        cordova.plugins.iosrtc.registerGlobals();
        cordova.plugins.iosrtc.debug.enable('*', true);

        // load adapter.js
        const adapterVersion = 'latest';
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://webrtc.github.io/adapter/adapter-' + adapterVersion + '.js';
        script.async = false;
        document.getElementsByTagName('head')[0].appendChild(script);
      }
    });
  }
}
