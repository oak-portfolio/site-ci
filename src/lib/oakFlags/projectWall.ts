/** Ticket 31: ProjectWall shows the cited projects as cover tiles with block-owned filter and sort; off, it is the Project list. */
export const oakProjectWall = true;
export const oakGalleryKey = "projectWall";

let forced: boolean | null = null;

export function forceOakProjectWall(on: boolean | null) {
  forced = on;
}

export const oakProjectWallOn = () => forced ?? oakProjectWall;
