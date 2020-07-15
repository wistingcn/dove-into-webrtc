import { Component } from '@angular/core';
import { ConnectService } from '../service/connect.service';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss']
})
export class Tab1Page {
  inputMsg;

  constructor(
    public cs: ConnectService,
  ) {
  }

}
