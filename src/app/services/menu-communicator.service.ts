import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MenuCommunicatorService {

  private gridInformant = new Subject<void>();

  constructor() { }


  public gridHide() {
    this.gridInformant.next();
  }

  public getGridInformed() {
    return this.gridInformant;
  }
}
