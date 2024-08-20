import { Component, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ChartBoardComponent } from './components/chart-board/chart-board.component';
import { NavMenuComponent } from './components/nav-menu/nav-menu.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ChartBoardComponent, NavMenuComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'flowchart-application';
  
}
