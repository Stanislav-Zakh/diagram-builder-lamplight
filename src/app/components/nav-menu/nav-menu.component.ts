import { Component, OnInit } from '@angular/core';
import { MenuCommunicatorService } from '../../services/menu-communicator.service';

@Component({
  selector: 'app-nav-menu',
  standalone: true,
  imports: [],
  templateUrl: './nav-menu.component.html',
  styleUrl: './nav-menu.component.css'
})
export class NavMenuComponent {

  constructor(private communicator: MenuCommunicatorService) {
  }

  public hideGrid() {
    this.communicator.gridHide();
  }

  



}
