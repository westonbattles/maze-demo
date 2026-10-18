
<br>
<br>
<br>
<br>
<br>
<h3> Designing The Maze Generation Algorithm </h3>

***

For the third-person action rogue-like i am making, I wanted to build a procedural maze system. One implementation of a procedural maze system that I am really fond of, is the one [Hypixel Skyblock Dungeons](https://hypixel-skyblock.fandom.com/wiki/Dungeons) uses.

In Skyblock Dungeons, mazes are built from rooms that are defined with *cell* shapes and rooms are made to match a specific shape of cells (1x1, 1x2, 1x3, 2x2, etc...)

![[Pasted image 20261015145856.png|401]]
(Map of a Skyblock Dungeon maze, a 1x1 cell is 30 blocks by 30 blocks)


 A benefit of this approach, is that during generation it makes checking the validity of a wished room placement trivial. All you need to do is check if the cells of the room you are trying to place are either already occupied, or out of bounds from our maze.




![[Screenshot 2026-10-16 at 10.34.19 AM.png|273]]
attempting to place this room in our generation step would fail

<br>
<br>

<h3>Implementation</h3>

***

Taking inspiration from The Maze Runner, I decided to map this generation idea onto a perimeter maze with four entrances from a central starting area. I also wanted there to be a boss room that spawns on a random outer cell, with the condition that it be reachable from every entrance

![[Screenshot 2026-10-16 at 11.06.43 AM.png|319]]


<br>
It follows that the first step of the algorithm is to simply figure out a path from each entrance to that boss room cell. If we allow these paths to merge, it creates a sort of spine for our maze:

![[Screenshot 2026-10-16 at 11.05.29 AM 1.png|319]]
We can use [Dijkstra's algorithm](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm) to do this, with random weight variance to allow for path variation


From here, the next step is to fill in the rest of our maze, which we can simply do by choosing a random "visited" cell (one that already has a path going through it), and creating a connection to one of its "unvisited" neighbors

![[Screenshot 2026-10-16 at 11.38.48 AM.png|350]]
*we can also add the stipulation that a connection can be created between two previously visited cells, so long as the distance between the two is greater than a threshold value (6 in my implementation). This creates more inner-connectivity throughout the maze which I find to be more enjoyable.*

***
<h2>Defining rooms</h2>

Now that we have our maze layout done (guaranteeing every cell gets visited), we can finally start adding rooms! But first, we should talk about how to actually define rooms.


It is obvious our rooms need to have definitions for openings. Since we need a way to figure out how to place rooms in accordance with the layout that we have already generated, we need to know which rooms have openings and where they are.

Because we set our rooms in this specific grid of cells, we can define an opening as belonging to the N/S/E/W direction of any given cell.

```c#
public enum GridDirection  
{  
    North,  
    East,  
    South,  
    West  
}

public class MazePlacedOpening  
{
    public Vector2Int Cell;  
    public GridDirection Direction;  
}
```
<p class="image-description">(example implementation in C#/Unity)</p>
<br>

A naive approach could be to attempt to place rooms along our generated path, by looping over every room definition we have (in a random sequence), and generating the rooms that exactly match the openings that are required by our layout.


In this approach you will run into the following issue a lot:

![[Screenshot 2026-10-17 at 9.20.02 AM.png|680]]
<p><span class="green">Green</span> is an openining, <span class="red">red</span> is not</p>

This example *almost* works, however the south doorway being an opening messes everything up. As you can see, it would lead outside of the bounds of the maze which should never happen. So in this naive approach, we would have to throw out this room in search of another, which is increasingly likely to happen with this method of allowing rooms.

In general the biggest issue with this method is the scope of which you would have to design rooms. You are essentially forced to create hundreds of rooms that all fit specific possible opening/closing shapes (which gets super crazy when you get up to 2x2, 1x4, and L shape rooms). As an indie developer, digging yourself into this kind of design hole is probably the worst idea on the planet.

<br>

***
<br>

My solution to this is to, instead of defining rooms as having cemented openings / closings, we define them to have what I call *opening opportunities*. An opening opportunity is essentially the same as a regular doorway opening, however we can programmatically "fill" the opening in if we need it to be closed. 

In Unity, a natural way of doing this is defining opening opportunities as GameObjects, and then having two children, "*Open*" and "*Closed*". Each respective child GameObject has within it, any necessary geometry for the given doorway state. So for example, if we wanted an opening to have vines around it so it looks more natural, we can keep that within the Open GameObject. And the doorway-filling geometry of course, goes within the Closed GameObject

<p class="image-description">open</p>
![[Screenshot 2026-10-17 at 9.47.49 AM.png|710]]

<p class="image-description">closed</p>
![[Screenshot 2026-10-17 at 9.47.40 AM.png|710]]


So to programmatically "fill in" a doorway, we just enable the Closed GameObject, and disable the Open one. Implementing our failed room example from above, we can see:

![[Screenshot 2026-10-17 at 9.56.56 AM.png]]
<p><span class="purple">Purple</span> is an opening opportunity</p>


The room is valid now! We can simply fill in the doorways that we know shouldn't be there, and keep open the ones that should. In fact, a 1x1 room with an opening opportunity in every direction can always be placed, no matter what the given cell layout looks like. So this kind of room actually serves as a very helpful fall-back room. If we are picking rooms at random from every room that we have made, having this kind of 1x1 in that pool, ensures we will always be able to generate a fully filled in maze. How cool is that??

<br>

***
<br>

As mentioned before, interconnectivity of rooms seems to be more enjoyable as it allows you to get to one place many different ways. This current algorithm doesn't allow for loops in our spanning tree, so let's fix that! [One such method](https://en.wikipedia.org/wiki/Maze_generation_algorithm#:~:text=Loops%2C%20which%20can%20confound%20naive%20maze%20solvers%2C%20may%20be%20introduced%20by%20adding%20random%20edges%20to%20the%20result%20during%20the%20course%20of%20the%20algorithm.) of introducing loops is simply to, before generating rooms, add random edges to our layout and then generate rooms like normal. This works, however an arguably simpler solution is to just leave two neighboring rooms with facing opening opportunities unfilled.

<!--![[Screenshot 2026-10-17 at 10.13.16 AM.png]]-->
![[Screenshot 2026-10-17 at 3.07.42 PM.png]]
As you can see, the middle openings are both set to "<span class="green">Open</span>"


All this requires us to do, is fill out every room in our maze first, WITHOUT resolving the opening opportunities. And then doing a separate pass for filling/opening doorways. And if we don't want every double connection to be left open, we can simply just gate it behind a random probability.

And that's the basis of the algorithm! We are guaranteed every time to get a filled in maze, with paths from each entrance to the boss room. There are a few more optimizations that my algorithm makes, which I left out here. For example, if a room fails in my generation step, I allow for it to be rotated 90 degrees and checked again (repeated for all possible orientations/placements). This brings up a lot of interesting challenges for asymmetrical rooms like the L shapes and the 1xN's, specifically how to ensure that every possible grid placement can get checked, but I'll leave that as a thought exercise for the reader.

<br>
Thanks for reading!