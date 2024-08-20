import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as d3 from 'd3'
import { MenuCommunicatorService } from '../../services/menu-communicator.service';

interface MyNode extends d3.SimulationNodeDatum {
  id: string;
  shape: string;
  colour: string;
  cd: [number, number, number][],
  rotation: number;
  x: number;
  y: number;
  start_x: number;
  start_y: number;

}

interface MyTextNode {
  id: string,
  text: string,
  width: number,
  height: number,
  x: number,
  y: number,
  style: string,
  size: string,
  family: string,
  colour: string
}

interface Link extends d3.SimulationLinkDatum<MyNode> {
   id: string;
   source: MyNode;
   target: MyNode;
   distance: number;
   colour: string;
   cx: number;
   cy: number;
   type: string;
   arrows: boolean;
   ar_reverse: boolean; 
}


@Component({
  selector: 'app-chart-board',
  standalone: true,
  imports: [],
  templateUrl: './chart-board.component.html',
  styleUrl: './chart-board.component.css'
})
export class ChartBoardComponent implements OnInit {
  @ViewChild('board', { static: true }) boardElement: ElementRef;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private board;
  private menu;
  private grid;
  private links_p;
  private nodes_p;
  private text_p;
  private selected_item;
  private boardBackground;
  private scale;
  private simulation;
  private width = 10000; // <- How far user can pan horizontally.
  private height = 10000; // <- vertically. 
  private gridData: {gridSize: number, gridColour: string, ishidden: boolean, vert: number[], horz: number[]} = {
    gridSize: 50, gridColour: "#F0E68C", ishidden: false, vert: [], horz: [] 
  }
  /* Fonts for the font selection option in the Text context menu. */
  private fonts: string[] = ["Arial", "Verdana", 
                             "Tahoma", "Trebuchet MS", 
                             "Times New Roman", 
                             "Georgia", "Garamond"]

  /* Default node types that are used during node selection menu initialization - initializeMenu().
     They are the starting point for any node shape on the board.
     Default shapes can be modified/expanded by adding new cd (coordinate points). */                           
  private readonly nodeTypes: {shape: string, cd: [number, number, number][]}[] = [
       {shape: "circle", cd: [[-30, -30, 0], [30, 30, 1]]},
       {shape: "square", cd: [[-30, -20, 0], [30, -20, 1], [30, 20, 2], [-30, 20, 3]]},
       {shape: "triangle", cd: [[0, -30, 0], [30, 30, 1], [-30, 30, 2]]},
       {shape: "diamond", cd: [[-30, 0, 0], [0, -30, 1], [30, 0, 2], [0, 30, 3]]}, 
  ];
  /* Lists for the key Elements on the board.
     Will be expanded as we are adding new features to the app.*/
                                    //  In the comments we will refer to them as:
  private textNodes: MyTextNode[] = [];  // <- Text or text
  private nodes: MyNode[] = []; // <- Node or node
  private links: Link[] = []; // <- Link or link

  /* Used to keep track of the nodes that are selected by the user and are to be linked.
     e.g. All nodes that glow with yellow (#fae396) and have slightly larger stroke-width.
     This List is very frequently modified as a user selects, deselects, links, and removes selected nodes. */
  private selectedNodes: MyNode[] = [];

  constructor(private menuCommunicator: MenuCommunicatorService) {

  }

  /* Custom Initialization Logic.
     We are working with SVG, so the sequence is important.  
  */
  ngOnInit() {
    this.initializeBoard(); // <- Init Board first.
    this.initializeMenu(); // <- Display the Node Selection Menu on top of the board.
    this.initSimulation(); // <- Init Simulation.
    this.menuCommunicator.getGridInformed().subscribe( signal => this.updateGrid()); // <- get signal from menu actions.
  }

  private initializeBoard() {
    this.svg = d3.select(this.boardElement.nativeElement); // <- select topmost svg element (.svg-content)
                  
     /* Now we are appending group elements (g) to the board.
        As the name suggests, they are used to group related elements.
        We are working with SVG, so as before, the order matters.        
      */
     
     /* Create a group for board elements and append all board sub-groups. */   
    this.board = this.svg.append('g');  
      this.grid = this.board.append('g'); // <- group for grid elements such as lines.

      /* Create a display hierarchy. First Links, on top of them nodes and text.*/
      this.links_p = this.board.append('g')
        .attr('fill', 'none'); // <- very important for preventing black afterimage in the curved Links.
      this.nodes_p = this.board.append('g');
      this.text_p = this.board.append('g');

     /* Create a border around the board. */  
    this.boardBackground =  this.svg.append('rect')
          .attr('width', '100%')
          .attr('height', '100%')
          .attr('fill', 'none')
          .attr('opacity', '1')
          .attr('stroke', 'url(#myGradient)') // <- gradient defined in <defs> inside HTML.
          .attr('stroke-width','6')
          //.attr('rx', '25')
          .classed('board', true);

    this.createGrid(); // <- add lines to the grid.
    
    /* Append <defs> with filters to the svg. */      
    //this.addShadow(this.svg);  
    this.addGlow(this.svg);

    /* Add zoom and pan to the board. */
    const zoom = d3.zoom()
          .scaleExtent([0.1, 10]) // <- zoom scale
          .translateExtent([[-this.width, -this.height], [this.width, this.height]]) // <- Set how far user can pan
          .on("zoom", (event) => {
            this.board.attr("transform", event.transform);
            this.scale = event.transform; // <- keep track of the current scale 
          });
    this.svg.call(zoom);              
  }

  private initializeMenu(): void {

   /* Mini Menu.*/
   let controlMenu = this.svg.append('g').classed('menu-control', true);
   /* Menu background. */
   controlMenu.append('path').attr('d', 'M0,-30 A30,30 0 0,1 0,30 L0,0 ZZ').attr('fill', 'url(#myGradient)').attr('stroke', '#dcaeae')
   .attr('opacity', 1).attr('stroke-width', 1);
   /* Lines on top of the background. */
   controlMenu.append('path').attr('d', 'M0,-12 L26,-12').attr('stroke', '#dcaeae').attr('stroke-width', 1);
   controlMenu.append('path').attr('d', 'M0,12 L26,12').attr('stroke', '#dcaeae').attr('stroke-width', 1);
   /* Add the N symbol. When clicked, hide the mini menu and display the node selection menu. */ 
   controlMenu.append('text').text('N').attr('y', 5).attr('x', 6).attr('fill', '#F8EECD').attr('filter', 'url(#glow)')
   .classed('selector-text', true)
   .on('click', () => {
    this.menu.attr('visibility', 'visible');
    controlMenu.attr('visibility', 'collapse');
   }); 
    
   /* Node Selection Menu. */
   this.menu = this.svg.append('g').attr('visibility', 'collapse'); 
   
   /* Menu Background. */     
   let rect_pos = (window.innerHeight / 2) - (window.innerHeight / 10) * this.nodeTypes.length + 100; // position at the center.
   this.menu.append('rect')
      .attr('y', rect_pos)
      .attr('width', '10%')
      .attr('height', '60%')
      .attr('fill', 'url(#myGradient)')
      .attr('opacity', '0.9')
      .attr('rx', 10)
      .attr('stroke', '#dcaeae')
      .attr('stroke-width','1')
      .attr('filter', 'url(#glow)');

   /* Small Button that hides node selection menu when clicked. */
   let collapseMenu = this.menu.append('g').classed('menu-popup', true)
   collapseMenu.append('path').attr('d', 'M0,-20 A20,20 0 0,1 0,20 L0,0 ZZ').attr('fill', 'url(#myGradient)').attr('stroke', '#dcaeae')
   .attr('opacity', 1).attr('stroke-width', 1)
   collapseMenu.append('text').attr('x', 3).attr('y', 5).text('N').attr('filter', 'url(#glow)').classed('selector-text', true)
    .on('click', () => {
      this.menu.attr('visibility', 'collapse')
      controlMenu.attr('visibility', 'visible')
    })  
      
    /*For each default node type. 
      Create node element and append it to the node selection menu.  
     */  
    for (let i = 0; i < this.nodeTypes.length; i++) {
        const menu_item = this.menu.append('g')  // Use a group instead of a path directly.
          .attr('transform', `translate(${window.innerWidth / 20}, ${rect_pos + (i + 1) * 70})`)
          .attr("cursor", "move");
       
        menu_item.append('path')
           /* <path> requires a specific string d (info on how to draw a path).
              Here, getPathForShape generates it from node's default shape and coordinates*/ 
          .attr("d", this.getPathForShape(this.nodeTypes[i].shape, 0, 0, this.nodeTypes[i].cd))  // Note the 0, 0 here
          .attr('fill', 'lightblue')
          .attr('stroke', 'black')
          .attr('filter', 'url(#glow)')
          //.attr('transform', 'scale()'); 
      
        /* Behavior to drag nodes from the selection menu and drop them on board. 
           Creates a copy of the targeted node. 
           During drag, the copy follows the cursor.
           When released, remove the copy and create a new node on the Board.     
        */  
        menu_item.call(d3.drag()
          .on("start", (event) => {
            const [x, y] = d3.pointer(event, this.svg.node());  // Get cursor position relative to SVG
            this.selected_item = menu_item.clone(true)
              .raise()  // Bring to front
              .attr('opacity', 0.7)
              .attr('transform', `translate(${x}, ${y})`);  // Position at cursor
          })
          .on('drag', (event) => {
            const [x, y] = d3.pointer(event, this.svg.node());  // Get cursor position relative to SVG
            this.selected_item.attr('transform', `translate(${x}, ${y})`);
          })
        .on('end', (event) => { 
          this.selected_item.remove(); //  on release remove element 
          if (event.x > window.innerWidth / 10) { // if it was released outside the node selection menu.
            
          /* Create a deep copy of node type default coordinates, 
             so that each node on the board could be modified without affecting other nodes. */  
          var cd_clone = [];
          this.nodeTypes[i].cd.forEach(val => cd_clone.push(Object.assign([], val)));  
          this.CreateNode(this.nodeTypes[i].shape, event.x, event.y, cd_clone); 
          } 
      }));
    }

    
    /* Similar process but for a text node. */
    const text = this.menu.append('text').text('Text')      // place it after all the default nodes
                          .attr('transform', `translate(65, ${(this, this.nodeTypes.length + 1) * 70 + rect_pos})`)
                          .attr("cursor", "move")
                          .classed("heavy-text", true);

    text.call(d3.drag()
          .on("start", (event) => {
            const [x, y] = d3.pointer(event, this.svg.node());  
            this.selected_item = text.clone(true)
              .raise() 
              .attr('opacity', 0.7)
              .attr('transform', `translate(${x}, ${y})`);  
          })
          .on('drag', (event) => {
            const [x, y] = d3.pointer(event, this.svg.node());  
            this.selected_item.attr('transform', `translate(${x}, ${y})`);
          })
          .on('end', (event) => { 
            this.selected_item.remove();
            if (event.x > window.innerWidth / 10) {
              this.createText(event.x, event.y)
            }
          }));     
  }


  /*
    Initialize force simulation.
    Forces are turned off for now.
     */
    
  private initSimulation(): void {

     this.simulation = d3.forceSimulation<MyNode, Link>(this.nodes)
     /*
      .force('link', d3.forceLink<MyNode, Link>(this.links)
         .id(d => d.id)
         .distance(d => d.distance)     
      ) 
      .force('charge', d3.forceManyBody().strength(-20))
      .force('collision', d3.forceCollide().radius( d =>  25))
      
      .on('tick', this.tickSim); */ 
  }
   
  /* Update how elements are displayed.*/
  private tickSim() {

    /* Draw a link with new coordinates. */
    this.board?.selectAll('.link')
    .attr("d", d => { 
      const midX = (d.source.x + d.target.x) * 0.5; 
      const midY = (d.source.y + d.target.y) * 0.5;
      
      if (d.type === "bezier") { // <- draw a link based on the type. 
      
      return `M${d.source.x},${d.source.y} ` +
             `Q${midX + d.cx * 2},${midY + d.cy * 2} ` + // <- quadratic curve offset should be * 2 to follow the control circle.
             `${d.target.x},${d.target.y}`;
    } else {
      return `M${d.source.x},${d.source.y} ` +
             `L${midX + d.cx},${midY + d.cy} ` +
             `L${d.target.x},${d.target.y}`;
      }
    });
    
    // update position of a link control circle.
    this.board?.selectAll('.link-control')
    .attr('cx', d => { 
      return ((d.source.x + d.target.x) * 0.5) + d.cx
    })
    .attr('cy', d => {
      return ((d.source.y + d.target.y) * 0.5) + d.cy
    });

    // `M${d.source.x},${d.source.y}L${d.target.x},${d.target.y}`

    // move a node to a new position.
    this.board?.selectAll('.node-item')
    .attr('transform', d => {
      const x = d.fx !== undefined && d.fx !== null ? d.fx : d.x;
      const y = d.fy !== undefined && d.fy !== null  ? d.fy : d.y;
      return `translate(${x}, ${y})`;  
    });
  }

  /* Create Links is called by linkSelectedElemnts(),
     which in turn is called by a user from the node context menu. */
  public createLinks() {
    /* If a user has selected at least two nodes.  */ 
    if (this.selectedNodes.length > 1) {
      /* Create new Links data that we will use later to create a new path element in the DOM. */
      for (let i = 1; i < this.selectedNodes.length; i++) {
        this.links.push({
          /* Id is used to identify specific links during removal. */
          id:  `link_${Date.now()}_${this.selectedNodes[i - 1].id}'_'${this.selectedNodes[i].id}`, // good enough for now, change to crypto
          source: this.selectedNodes[i - 1], 
          target: this.selectedNodes[i], 
          distance: Math.sqrt(
                    Math.pow(this.selectedNodes[i - 1].x  - this.selectedNodes[i].x, 2) 
                  + Math.pow(this.selectedNodes[i - 1].y  - this.selectedNodes[i].y, 2)),
          colour: "#ADD8E6",
          cx: 0,
          cy: 0,
          type: "bezier", 
          arrows: false,
          ar_reverse: false
        });  
      }
      this.selectedNodes = []; // remove all nodes from the selected list.
    }

    this.updateLinks();
  }

  private updateLinks() {
    /* Select all elements classed as .link (if any exist) and bind our links data to them.*/
    const link = this.links_p.selectAll(".link")
              .data(this.links, d => d.id); // Very important. For the app to know which link we are removing.

          /* For all new entries in the links list. */  
          link.join(enter => {
            
            const linkEnter = enter.append("g")
          /* Append SVG element representing link. */
          linkEnter.append('path')
              .attr('id', d => d.id)
              .attr("d", d => { return `M${d.source.x},${d.source.y}S${(d.source.x + d.target.x) / 2 + d.cx},${(d.source.y + d.target.y) / 2 + d.cy} ${d.target.x},${d.target.y}`;})
              .attr("pathLength", 10)
              .attr("stroke", d => d.colour)
              .attr("stroke-width", "6")
              .attr("stroke-opacity", "0.6")
              //.attr("stroke-linecap", "round")
              .attr('filter', 'url(#glow)')
              .classed("link", true)

              /* Add context menu functionality to the Link. */
              .on('contextmenu', (event, d) => {
              this.showContextMenu(event, d, event.currentTarget, "link");})

              /* Add arrows to the Link and render them above the path but below the link control circle. */
              let text = linkEnter.append('text').style('fill', d => d.colour).style('font-size', '30px')
              .style('visibility', 'collapse');
                                                                         
              text.append('textPath').attr('startOffset', '25%').text("\u2192").classed('source-arrow', true).style('fill', d =>  d.source.colour).attr('href', d => '#' + d.id)
              text.append('textPath').attr('startOffset', '50%').text("\u2192").classed('link-arrow', true).style('fill', d =>  d.colour).attr('href', d =>  '#' + d.id)
              text.append('textPath').attr('startOffset', '75%').text("\u2192").classed('target-arrow', true).style('fill', d =>  d.target.colour).attr('href', d =>  '#' + d.id)      
                     
          /* The Link control circle */                                                                                   
          let circel = linkEnter.append('circle')
                                .attr('id', d => d.id)
                                .attr('fill', 'white').attr('r', 3)
                                .attr('stroke', 'white')
                                .attr('stroke-width', 1)
                                .attr('opacity', 0.5)
                                /* Change for clarity and performance.
                                   Place between source and target nodes + offset (default 0).*/
                                .attr('cx', d => (d.source.x + d.target.x) * 0.5 + d.cx)
                                .attr('cy', d => (d.source.y + d.target.y) * 0.5 + d.cy) 
                                .classed("link-control", true);     

          /* 
          Assign drag behavior that calculates offset from the center 
          and save it to be used in the tickSim().
          */                      
          circel.call(
            d3.drag().on('drag', (event, d: any) => {
            d.cx =  event.x - ((d.source.x + d.target.x) * 0.5);
            d.cy = event.y - ((d.source.y + d.target.y) * 0.5);
            this.tickSim(); // <- visualize update to the circle position and link curvature.
           }));
          },

          /* Update colour of existing links. 
             This method is called each time we change Link colour.          
          */  
          update => {
            update.attr("stroke", d => d.colour)
           },

           /* We are performing selectAll on the .link which is path element. 
              So, to remove path, arrows, and control element, 
              we need to remove parent group element (g).           
           */
          exit => exit.select(function(){
            this.parentElement.remove()
            }));
          
          /* Uncomment if we are going to use simulation. */    
          //this.simulation.force('link')!.links(this.links);
          //this.simulation.alpha(1).restart();           
  }

  /* CreateNode is called when a user is releasing node (on drag end) outside of the node selection menu.*/
  CreateNode(shape: string, x_in: number, y_in: number, cd: [number, number, number][]) {
    const node: MyNode = {
      id: `node_${Date.now()}`,
      shape: shape,
      cd: cd,
      rotation: 0,
      colour: "#ADD8E6", // lightblue
      start_x: x_in, // Create node at the location, where user realeased selection node.   
      start_y: y_in,
      x: Math.floor((x_in - this.scale.x) / this.scale.k),
      y: Math.floor((y_in - this.scale.y) / this.scale.k)
    }

    this.nodes.push(node);
    this.updateNodes();
  }


  private updateNodes() {
    const node = this.nodes_p.selectAll('.node-item')
                 .data(this.nodes, d => d.id);

    node.join( enter => {

      /* Adjust location based on the current pan and zoom of the board. */
      const nodeEnter = enter.append('g')
      .attr('transform', d => `translate(${(d.start_x - this.scale.x) / this.scale.k}, 
                                        ${(d.start_y - this.scale.y) / this.scale.k})`) // <- (y - panY) / zoom 
      .classed('node-item', true)
      .on('contextmenu', (event, d) => {
        this.showContextMenu(event, d, event.currentTarget, "node");}); // <- add context menu

      /* Node appearance */
      const color_node = nodeEnter.append('path')
      .attr("d", d => this.getPathForShape(d.shape, 0, 0, d.cd))
      .attr('transform', d => `rotate(${d.rotation})`) // <- default 0
      .attr('fill', d => d.colour)
      .attr('stroke', 'black')
      //.attr('filter', 'url(#dropshadow)');
      .attr('filter', 'url(#glow)');

      /* Create a group for control (scale and rotate) buttons that will be rotated in sync with the path. */
      let controls = nodeEnter.append('g').attr('transform', d => `rotate(${d.rotation})`).classed('controls', true);

      /* Add Scale Controls */
      let circle = controls.selectAll('.control').data(d => d.cd) // <- create scale control for each coordinate (angle) of the shape.
        .join('circle')
        .attr('r', 5)
        .attr('cx', d =>  d[0]) 
        .attr('cy', d =>  d[1])
        .attr('opacity', 0.5)
        .attr('fill', 'white')
        .attr('class', 'control');

      circle.call(d3.drag()
      .on('drag', (event, d) => {

        let c = d3.select(event.sourceEvent.target); 

        if (c.attr('class') !== 'control') {
          return;
        }
        
        d[0] = event.x; // <- get new coordinates for control and shape. 
        d[1] = event.y; 
        
      c.attr('cx', d[0]).attr('cy', d[1]); // <- move scale control to the new location.
      color_node
      .attr('d', (da) => {        
            //da[d[2]] = d; 
            return this.getPathForShape(da.shape, 0, 0, da.cd); // <-  draw a shape with new coordinates.
            });
      }));

      /* Add Rotation Controls */
      
      let rotate;
      controls.append('circle').attr('r', 5)
      .attr('cx', d => (d.cd[0][0] + d.cd[1][0]) / 2)
      .attr('cy', d => (d.cd[0][1] + d.cd[1][1]) / 2)
      .attr('opacity', 0.5).attr('fill', 'white').classed('control', true)
      .on('mousedown', (event, d: any) => {
        event.stopImmediatePropagation(); // very important, to prevent the conflict with zoom.
        rotate = setInterval(() => { 
      color_node
      .attr('transform', d => {        
            if (d.rotation <= -360 ) {
              d.rotation = d.rotation % d.rotation
            } else {       
            d.rotation -= 1;
            }
            controls.attr('transform', `rotate(${d.rotation})`) // <- we are rotating path and controls 
            return `rotate(${d.rotation})`})
          }, 16)})
      .on('mouseup mouseout', (event) => {
        clearInterval(rotate)
      });

      controls.append('circle').attr('r', 5)
      .attr('cx', d => (d.cd[d.cd.length - 2][0] + d.cd[d.cd.length - 1][0]) / 2)
      .attr('cy', d => (d.cd[d.cd.length - 2][1] + d.cd[d.cd.length - 1][1]) / 2)
      .attr('opacity', 0.5).attr('fill', 'white').classed('control', true)
      .on('mousedown', (event, d: any) => {
        event.stopImmediatePropagation(); // very important, to prevent the conflict with zoom.
        rotate = setInterval(() => { 
      color_node
      .attr('transform', d => {
            if (d.rotation >= 360 ) {
              d.rotation = d.rotation % d.rotation
            } else {       
            d.rotation += 1;
            }
            controls.attr('transform', `rotate(${d.rotation})`) 
            return `rotate(${d.rotation})`})
          }, 16)})
      .on('mouseup mouseout', (event) => { 
        clearInterval(rotate)
      });
    
      /* Node Drag Behaviour */ 
      const drag = d3.drag()
        .on('start', (event, d: any) => { 
          if (!event.active) this.simulation.alphaTarget(0.3).restart(); // important for simulation to work properly
          d.fx = d.x // start fix location
          d.fy = d.y 
        })
        .on('drag', (event, d: any) => { 
            d.fx = event.x;
            d.fy = event.y; 
            this.tickSim(); // <- visualize update to the circle position and link curvature.
        }).on('end', (event, d: any) => {
          if (!event.active) this.simulation.alphaTarget(0);
          //d.x = d.fx 
          //d.y = d.fy 
          //d.fx = null; // <-Note: uncomment this + simulation to drag linked nodes.
          //d.fy = null;
          this.simulation.alpha(1).restart();
        });
        
      nodeEnter.call(drag);

      /* Add select functionality to the node. */ 
      this.addMenu(color_node);
  },

  /* Update colour of existing nodes. 
     This method is called each time we change Node colour. */
  update => { 
    update.selectChild('path').attr('fill', d => d.colour);
  },
  exit => {
    exit.remove();
  });

    /* Test Simulation setup */
    this.simulation.nodes(this.nodes);
    this.simulation.alpha(1).restart();
  }

  /*
     Select or deselect nodes that are to be linked.
     When a node is left-clicked, change the node visual by adding .selected class.
     and add node datum to the selectedNodes to keep track of them.  
  */
  private addMenu(node: any) {
      node.on("click", (event, d: MyNode) =>{
        const clickedNode = d3.select(event.currentTarget as SVGElement);
        if (clickedNode.classed("selected")) { 
            clickedNode.classed("selected", false);
            this.selectedNodes.splice(this.selectedNodes.findIndex((search) => search.id === d.id), 1);
        } else {
            clickedNode.classed("selected", true);
            this.selectedNodes.push(d);
        }
      });
  }

  private createGrid() {
    // Vertical lines
    let vert = this.grid.selectAll(".vertical")
                  //  from        to          step   
      .data(d3.range(-this.width, this.width, this.gridData.gridSize));
  
    // When first creating vert lines.  
    vert.enter().append("line")
      .attr("class", "vertical")
      .attr("x1", d => d)
      .attr("y1", -this.height)
      .attr("x2", d => d)
      .attr("y2", this.height)
      .style("stroke", this.gridData.ishidden ? "none": this.gridData.gridColour)
      .style("stroke-width", 1);

    // When update vert lines  
    vert.style("stroke", this.gridData.ishidden ? "none" : this.gridData.gridColour)  
  
    // Horizontal lines
    let horz = this.grid.selectAll(".horizontal")
      .data(d3.range(-this.height, this.height, this.gridData.gridSize));

    horz.enter().append("line")
      .attr("class", "horizontal")
      .attr("x1", -this.width)
      .attr("y1", d => d)
      .attr("x2", this.width)
      .attr("y2", d => d)
      .style("stroke", this.gridData.ishidden ? this.svg.attr("fill") : this.gridData.gridColour)
      .style("stroke-width", 1);

    // When update horz lines    
    horz.style("stroke", this.gridData.ishidden ? this.svg.attr("fill") : this.gridData.gridColour)    
  }

  /* Update grid is called from the Misc menu */
  private updateGrid(): void {
    this.gridData.ishidden = !this.gridData.ishidden; // Reverse bool
    this.createGrid()
  } 

  private addShadow(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>): void {

    var defs = svg.append("defs");

    var filter = defs.append("filter")
        .attr("id", "dropshadow")

        // Rework...
  }

  /* 
     Append <defs> element to store Glow Filter.  
  */
  private addGlow(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>): void {
      var defs = svg.append("defs");

      //Filter for the outside glow
      var filter = defs.append("filter")
          .attr("id","glow");
      filter.append("feGaussianBlur")
          .attr("stdDeviation", 2.4)
          .attr("result","coloredBlur");
      var feMerge = filter.append("feMerge");
      feMerge.append("feMergeNode")
          .attr("in","coloredBlur");
      feMerge.append("feMergeNode")
          .attr("in","SourceGraphic");
  }


  /* 
  Take shape to determine which type of shape to draw. 
  Based on the provided coordinate points, 
  create a string with instructions on how to draw a shape for the path d attribute. 
  
  By changing position or number of coordinate points, we can get very different and unique-looking shapes.
  User can change the position of the coordinate points by interacting with a node 
  but number of points is based on the default shapes and cannot be changed by the user.   
  */
  private getPathForShape(
    shape: string,
    x: number,
    y: number,
    points: [number, number, number][]
  ): string {
    
  
    // Adjust all points relative to the starting x and y coordinates.
    const adjustedPoints = points.map(([px, py]) => [x + px, y + py]);
  
    switch (shape) {
      case 'square':
      case 'triangle':
      case 'diamond':    
        // Create a path for shapes with angles.
        return 'M ' + adjustedPoints.map(p => p.join(',')).join(' L ') + ' Z';
      
      case 'circle':
        // For circle/ellipse, we use the first two points to determine radii
        if (points.length < 2) {
          console.error('At least 2 points are required for circle/ellipse');
          return '';
        }
        const [x1, y1] = adjustedPoints[0];
        const [x2, y2] = adjustedPoints[1];
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        const cx = x + (x2 + x1) / 2 - x;
        const cy = y + (y2 + y1) / 2 - y;
        return `M ${cx-rx},${cy} a${rx},${ry} 0 1,0 ${rx*2},0 a${rx},${ry} 0 1,0 ${-rx*2},0`;
      
      case 'path':
        // Create a custom path using the provided points
        return 'M ' + adjustedPoints.map((p, i) => {
          if (i === 0) return p.join(',');
          return 'L ' + p.join(',');
        }).join(' ') + ' Z';
      
      default:
        console.error('Unsupported shape type');
        return '';
    }
  }
  /* 
     Moves context menu at the event coordinates and displays it.
     Generates Context menu interface based on the element type it was called by.
      */
  private showContextMenu(event: MouseEvent, d: any, element: SVGElement, type: string): void {
    event.preventDefault();
  
    // Move context menu
    const contextMenu = d3.select('#context-menu');
    contextMenu.style('display', 'block')
      .style('left', `${event.pageX}px`) // <- returns the X (horizontal) coordinate (in pixels) at the mouse click.
      .style('top', `${event.pageY}px`);

    // Hide menu when clicking outside
    d3.select('body').on('click', (event) => { // Note: click event is assigned to the body.
      let rect: DOMRect = (contextMenu.node() as HTMLElement).getBoundingClientRect();
      if  (event.clientX < rect.x || event.clientX > rect.x + rect.width || 
            event.clientY <rect.y || event.clientY > rect.y + rect.height 
      ) { 
        contextMenu.style('display', 'none');
        d3.select('body').on('click', null); 
      }
    });

    // Setup menu item actions
    let ul : any = contextMenu.selectChild('ul');
    ul.html(''); // <- clear previous menu

    switch(type) {

      case "node" :  
        ul.append('li').text("Link Items").classed('context-li', true).on('click', () => this.linkSelectedElemnts(d, element));
        ul.append('li').text("Change Colour").classed('context-li', true).on('click', () => this.changeColourNode(d, element));
        ul.append('li').text("Remove Node").classed('context-li', true).on('click', () => this.removeNode(d));
        ul.append("input").attr('type', 'color').attr('value', d.colour).on('input', (event) => { this.changeColourNode(event, d)});
          break;
      

      case "link": 
        ul.append('li').text("Change Link Type").classed('context-li', true).on('click', () => this.changeLinkType(d));
        ul.append('li').text("Add/Remove Arrows").classed('context-li', true).on('click', () => this.addArrows(d, element));
        ul.append('li').text("Reverse Arrows").classed('context-li', true).on('click', () => this.reverseArrows(d, element));
        ul.append('li').text("Adjust Arrow Colour").classed('context-li', true).on('click', () => this.updateArrows(d, element));
        ul.append('li').text("Remove Link").classed('context-li', true).on('click', () => this.removeLink(d));
        ul.append("input").attr('type', 'color').attr('value', d.colour).classed('pick', true).on('input', (event) => this.changeColourLink(event, d));
        break;

      case "text": 
        let selector = ul.append("select").classed('context-li', true)
        selector.on('input', (event) => this.changeFontText(event, d));
        for (let font of this.fonts) {
          selector.append("option").text(font);
        }
        selector.property('value', d.family)
        ul.append("input").attr('type', 'range').attr('min', 6).attr('max', 32).attr('step', 1).attr('value', d.size).on('input', (event) => this.changeSizeText(event, d));
        ul.append('li').text("Remove Text").classed('context-li', true).on('click', () => this.removeText(d));
        ul.append("input").attr('type', 'color').attr('value', d.colour).on('input', (event) => this.changeColourText(event, d));
        break;
    } 
    
  }

  /* Wrapper for the createLink.*/
  private linkSelectedElemnts(d: any, element: SVGElement): void {
      /* 
         If we have at least one element selected 
         and the element from the context menu this method was called is not selected.
         We select the caller element to be linked.
      */
     // Note: While testing, change children[0] depending on the position of render of elements. (e.g. path , circle).
    if (this.selectedNodes.length >= 1 && element.children[0].getAttribute('class') !== "selected") 
      {
      element.childNodes[0].dispatchEvent(new Event("click"));
      } 

    this.deselectNodes(element.parentElement)

    this.createLinks();
  }

  /* Change elements colour. */ 

  changeColourNode(event, d: any): void {
    d.colour = event.target.value
    this.updateNodes();
  }

  changeColourLink(event, d: any): void {
    d.colour = event.target.value;
    this.updateLinks();
  }

  changeColourText(event, d: any): void {
    d.colour = event.target.value;
    this.updateText();
  }


  /* Link Modifiers. */

  private changeLinkType(d: any) {
    if (d.type === "bezier")  {
      d.type = "line";
    } else {
      d.type = "bezier";
    }
    this.tickSim();
  }

  private addArrows(d: any, element: SVGElement) {
    d.arrows = !d.arrows;
    d3.select(element.parentElement).select('text').style('visibility', d.arrows ? 'visible' : 'collapse')
  }

  private reverseArrows(d: any, element: SVGElement) {
    d.ar_reverse = !d.ar_reverse;

    let text = d3.select(element.parentElement).select('text');

    let uni = d.ar_reverse ? "\u2190" :"\u2192"

    text.select('.source-arrow').text(uni);
    text.select('.link-arrow').text(uni);
    text.select('.target-arrow').text(uni);
  }

  private updateArrows(d: any, element: SVGElement) {
    
    let text = d3.select(element.parentElement).select('text')

    text.select('.source-arrow').style('fill', d.source.colour)
    text.select('.link-arrow').style('fill', d.colour)
    text.select('.target-arrow').style('fill', d.target.colour)
  }


  /* Text Modifiers. */

  changeFontText(event, d: any): void {
    d.family = event.target.value;
    this.updateText();
  }
  changeSizeText(event, d: any): void {
    d.size = event.target.value;
    this.updateText();
  }

  /* Remove Elements */

  private removeLink(d: any) {
    this.links.splice(this.links.findIndex(search => search.id === d.id), 1);

    this.updateLinks(); // update
    this.tickSim(); // visualize update
  }

  private removeNode(d: any) {

    /* Remove node and all associated links. */
    this.nodes.splice(this.nodes.findIndex(search => search.id === d.id), 1);
    let temp: Link[] = []; 
    this.links.forEach( (link) => {
      if (link.source.id !== d.id && link.target.id !== d.id) {
        temp.push(link)
      }
      this.links = temp;
    })

    this.updateNodes(); // update
    this.updateLinks();

    this.tickSim(); // visualize update
  }

  private removeText(d: any) {
    this.textNodes.splice(this.textNodes.findIndex(search => search.id === d.id), 1);

    this.updateText(); // update

  }

  // change it
  private deselectNodes(parentElement: HTMLElement): void {

    for (let i = 0; i < parentElement.children.length; i++) {
      parentElement.children[i].children[0].setAttribute('class', '');
    }

  }

  public createText(x_in: number, y_in: number): void {

    const text: MyTextNode = {
      id: `text_${Date.now()}`,
      text: 'Text',
      width: 100,
      height: 50,
      x: Math.floor((x_in - this.scale.x) / this.scale.k),
      y: Math.floor((y_in - this.scale.y) / this.scale.k),
      style: "bold",
      size: "18",
      family: "Arial",
      colour: "#FFFFFF"
    }

    this.textNodes.push(text);
    this.updateText();
  }

  private updateText(): void {

    const text = this.text_p.selectAll(".text")
              .data(this.textNodes, d => d.id);

    /* When new text is added. */
    const textEnter = text.enter().append('g')
    .attr('transform', d => `translate(${d.x}, ${d.y})`)
    .attr('class', 'text')
    .call(d3.drag().on('drag', (event, d: any) => {   
      d.x = event.x
      d.y = event.y
      textEnter.attr('transform',`translate(${event.x}, ${event.y})`)}));

    /* Append foreign Object with HTML 
      <p> element to display static text.   */
    textEnter.append('foreignObject')
    .attr('width', d => d.width + 20)
    .attr('height', d => d.height + 20)
    .append('xhtml:p') // <- <p>
    .attr('text-wrap', 'pretty')
    .style('font', d => `${d.style} ${d.size}px ${d.family}`)
    .style('color', d => d.colour)
    .text(d => d.text)
    // context menu
    .on('contextmenu', (event, d) => {
      this.showContextMenu(event, d, event.currentTarget, "text");});
    
    // edit on double click
    textEnter.on('dblclick', (event, d) => {
      event.stopPropagation();
      const node: d3.Selection<SVGSVGElement, {}, HTMLElement, any> = d3.select(event.currentTarget);
      const text = node.select('p');
  
      text.style('display', 'none'); // <- hide text
  
      /* foreign Object should have a size equal 
      or larger to display textarea properly. */
      const fo = node.select('foreignObject') 
      .attr('width',   d.width + 20)
      .attr('height',  d.height + 20)
        
        
      const textarea = fo.append('xhtml:textarea')
        .property('value', d.text)
        .style('width', `${d.width}px`)
        .style('height', `${d.height}px`)
        .style('font', `${d.style} ${d.size}px ${d.family}`)
        .style('color', d.colour)
        .classed('text-edit', true) // set classes

        // When lose focus, remove textarea and display new text. 
        .on('blur', (event) => {
          d.text = event.currentTarget.value;
          text.text(d.text).style('display', null).attr('text-wrap', 'pretty'); // wrap text
          textarea.remove();
        // When textare is resized, save new size and update foreignobject. 
        }).call(d3.drag().on('drag', (event, d: any) => { 
          event.sourceEvent.stopPropagation(); // Prevent propagation to parent elements
  
          // Get new width and height when textarea is resized.
          const textarea = event.sourceEvent.target;
          const newWidth = textarea.offsetWidth;
          const newHeight = textarea.offsetHeight;

          // Update the data object, to remember the size of the textarea.
          d.width = newWidth === undefined ? d.width : newWidth;
          d.height =  newHeight === undefined ? d.width : newHeight;
          // Make foreign object slightly larger than textarea. 
          fo.attr('width',  d.width + 50)
            .attr('height',  d.height + 50)
              }));
  
      (textarea.node() as HTMLElement).focus();
    });

    /* Update existing text */
    text.selectChild('foreignObject')
    .selectChild('p')
    .style('font', d => `${d.style} ${d.size}px ${d.family}`)
    .style('color', d => d.colour)
 
    text.exit().remove();
    textEnter.merge(text);     
  }
}





