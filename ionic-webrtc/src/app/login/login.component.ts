import { Component, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ConnectService } from '../service/connect.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {

  ipForm = this.fb.group({
    ip: [''],
  });

  constructor(
    private fb: FormBuilder,
    private cs: ConnectService,
    private router: Router,
  ) { }

  ngOnInit() {
    // 当收到建连成功事件后，跳转到tabs页面
    this.cs.connected$.subscribe((event) => {
      this.router.navigateByUrl('/tabs');
    });
  }

  // 点击“连接”
  onConnect() {
    const ipAddr = this.ipForm.get('ip').value;

    const roomID = 'signalingtestroom';
    const peerID = this.makeRandomString(8);
    const socketURL =  `wss://${ipAddr}:4433/?roomId=${roomID}&peerId=${peerID}`;
    console.log(socketURL);
    this.cs.connect(socketURL, peerID);
  }


  private makeRandomString(length) {
    let outString = '';
    const inOptions = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
      outString += inOptions.charAt(Math.floor(Math.random() * inOptions.length));
    }
    return outString;
  }
}
