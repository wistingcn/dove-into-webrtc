import { Component } from '@angular/core';
import { ConnectService } from '../service/connect.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss']
})
export class TabsPage {

  constructor(
    public cs: ConnectService
  ) {}

}
