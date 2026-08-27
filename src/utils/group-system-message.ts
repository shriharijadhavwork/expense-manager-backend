/**
 * Builds human-readable system copy for group membership events.
 * Persisted via `postGroupSystemEvent` onto the latest active group thread.
 */
export type GroupSystemEvent =
  | { type: "member_added"; actorName: string; targetName: string }
  | { type: "member_removed"; actorName: string; targetName: string }
  | { type: "member_left"; actorName: string }
  | { type: "ownership_transferred"; actorName: string; targetName: string };

export function buildGroupSystemMessage(event: GroupSystemEvent): string {
  switch (event.type) {
    case "member_added":
      return `${event.actorName} added ${event.targetName} to the group`;
    case "member_removed":
      return `${event.actorName} removed ${event.targetName} from the group`;
    case "member_left":
      return `${event.actorName} left the group`;
    case "ownership_transferred":
      return `${event.actorName} transferred ownership to ${event.targetName}`;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
