import { registerWebMcpTool } from "./webmcp";
import { getBryntumScheduler } from "../bryntum-timeline";

// Bryntum views as tools. An agent, including Mosaic, can switch which Bryntum view the Disputes page shows and zoom the Scheduler,
// the same things a person does with the tabs and the zoom buttons.
export const DISPUTE_VIEWS = ["timeline", "calendar", "claims board", "shipments", "claims", "file a claim"] as const;

const slug = (view: string): string => view.toLowerCase().replace(/\s+/g, "-");
const VALUE_BY_NAME: Record<string, string> = { timeline: "timeline", calendar: "calendar", "claims board": "board", board: "board", shipments: "shipments", claims: "claims", "file a claim": "file" };

export function installBryntumTools(setView: (value: string) => void): () => void {
  const releases = [
    registerWebMcpTool({
      name: "bryntum_show_view",
      description: `Switch the Disputes page to one Bryntum view: ${DISPUTE_VIEWS.join(", ")}. The timeline is the Scheduler, calendar is Bryntum Calendar, claims board is the TaskBoard, shipments is the Grid.`,
      inputSchema: { type: "object", properties: { view: { type: "string", enum: [...DISPUTE_VIEWS] } }, required: ["view"] },
      execute: (args) => {
        const wanted = VALUE_BY_NAME[String(args.view ?? "").toLowerCase()];
        if (!wanted) throw new Error(`Unknown view '${args.view}'. Use one of: ${DISPUTE_VIEWS.join(", ")}.`);
        setView(wanted);
        return { showing: slug(String(args.view)) };
      }
    }),
    registerWebMcpTool({
      name: "bryntum_scheduler_zoom",
      description: "Zoom the Bryntum Scheduler timeline: in, out or fit (show every shipment). The timeline view must be open.",
      inputSchema: { type: "object", properties: { action: { type: "string", enum: ["in", "out", "fit"] } }, required: ["action"] },
      execute: (args) => {
        const scheduler = getBryntumScheduler();
        if (!scheduler) throw new Error("The Scheduler is not on screen. Call bryntum_show_view with timeline first.");
        const action = String(args.action);
        if (action === "in") scheduler.zoomIn();
        else if (action === "out") scheduler.zoomOut();
        else scheduler.zoomToFit({ leftMargin: 40, rightMargin: 40 });
        return { zoomed: action };
      }
    })
  ];
  return () => releases.forEach((release) => release());
}
