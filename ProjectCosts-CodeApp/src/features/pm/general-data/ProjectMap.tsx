/**
 * `map_con_GeneralData_DisplayProject_Body_General_Content_Map` (`Map@1.8.27`, Y:4357-4440) on Microsoft's Azure Maps
 * Web SDK (`azure-maps-control`, the engine family behind the canvas Map control), 6 Nov 2026 (D25).
 *
 * Loaded with `React.lazy` from the screen, so the SDK (~1 MB) is fetched only when General Data opens and no other
 * screen's bundle changes. Authentication is a SAS token from the solution flow (`platform/azureMapsToken.ts`): the
 * SDK asks `getToken` whenever it needs one, and the cache answers or refreshes.
 *
 * Canvas → here:
 *   `Items` (one row: Name = the saved 'Project Name', Lat/Lng = `mapMarker`) → `pin` / `label`, a labelled pin
 *   `CurrentLocation: true` + `CurrentLocation*`                            → `device`, a blue dot
 *   `DefaultZoomLevel: 12`                                                    → `ZOOM`
 *   `OnMapClick` (opens the confirmation when the point differs)              → `onPick` (the screen decides)
 *   `BorderRadius: 4`, 90 % of the cell                                       → the screen's `map` class
 *
 * DIVERGENCE (Azure Maps integration, 6 Nov 2026): the canvas `DefaultLatitude/Longitude` is the DEVICE location, so a
 * project far from the user opened with its pin off-screen. Here the view opens on the pin, and a position typed into
 * Latitude / Longitude that falls outside the view eases the camera to it (zoom kept) once typing pauses. A map click
 * never moves the view: the clicked point is already visible. Recorded in file 13.
 */
import { useEffect, useRef, useState } from "react";
import * as atlas from "azure-maps-control";
import "azure-maps-control/dist/atlas.min.css";
import { makeStyles } from "@fluentui/react-components";
import { azureMapsToken, invalidateAzureMapsToken, mapErrorKind, type MapErrorKind } from "@/platform/azureMapsToken";
import { logError } from "@/platform/requestLog";
import { palette } from "@/theme/tokens";
import { MAP_MESSAGES } from "./rules";

/** `DefaultZoomLevel: =12` */
export const ZOOM = 12;
const FOLLOW_PIN_DELAY_MS = 400;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ProjectMapProps {
  pin: LatLng;
  /** `gblRecordSelectedProject.'Project Name'` */
  label: string;
  device: LatLng | null;
  /** The player's language, as the canvas map's labels. */
  language: string;
  /** While a save runs, a click does nothing. */
  disabled: boolean;
  onPick: (p: LatLng) => void;
}

const useStyles = makeStyles({
  root: { position: "relative", width: "100%", height: "100%", borderRadius: "4px", overflow: "hidden" },
  // Width/height explicitly: the SDK's `.maplibregl-map { position: relative }` loads after these styles and
  // overrides `absolute`, which left the map 0 px high.
  host: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  status: {
    position: "absolute", left: "8px", bottom: "8px", maxWidth: "calc(100% - 16px)",
    paddingTop: "2px", paddingBottom: "2px", paddingLeft: "6px", paddingRight: "6px",
    backgroundColor: palette.white, color: palette.neutralPrimary, fontSize: "12px",
  },
});

const valid = (p: LatLng): boolean =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;


export default function ProjectMap(props: ProjectMapProps) {
  const s = useStyles();
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<atlas.Map | null>(null);
  const pinSource = useRef<atlas.source.DataSource | null>(null);
  const deviceSource = useRef<atlas.source.DataSource | null>(null);
  const latest = useRef(props);
  const [status, setStatus] = useState<"loading" | "ready" | MapErrorKind>("loading");
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    if (!hostRef.current) return;
    const first = latest.current;
    const center = valid(first.pin) ? first.pin : null;
    const map = new atlas.Map(hostRef.current, {
      ...(center ? { center: [center.lng, center.lat] } : {}),
      zoom: ZOOM, language: first.language, view: "Auto", style: "road",
      authOptions: {
        authType: atlas.AuthenticationType.sas,
        getToken: (resolve, reject) => { azureMapsToken().then(resolve, reject); },
      },
    });
    mapRef.current = map;
    map.events.add("error", (e) => {
      const error = (e as { error?: unknown }).error ?? new Error("unknown map error");
      const kind = mapErrorKind(error);
      // Azure Maps refused the token: drop it so the next tile request fetches a new one.
      if (kind === "accessDenied") invalidateAzureMapsToken();
      // A token failure is already logged once by the cache, with the flow's code and message.
      if (kind === "accessDenied" || !(error instanceof Error && error.name === "MapTokenError")) {
        logError("Azure Maps", error instanceof Error ? error.message : String(error));
      }
      setStatus(kind);
    });
    map.events.add("ready", () => {
      setStatus("ready");
      map.controls.add(new atlas.control.ZoomControl(), { position: atlas.ControlPosition.TopRight });
      const pins = new atlas.source.DataSource();
      const dev = new atlas.source.DataSource();
      map.sources.add([pins, dev]);
      map.layers.add(new atlas.layer.BubbleLayer(dev, undefined, { radius: 7, color: "#0078d4", strokeColor: "#ffffff", strokeWidth: 2 }));
      map.layers.add(new atlas.layer.SymbolLayer(pins, undefined, { textOptions: { textField: ["get", "name"], offset: [0, 1.2], anchor: "top" } }));
      pinSource.current = pins;
      deviceSource.current = dev;
      const p = latest.current;
      if (valid(p.pin)) pins.setShapes([new atlas.data.Feature(new atlas.data.Point([p.pin.lng, p.pin.lat]), { name: p.label })]);
      if (p.device) dev.setShapes([new atlas.data.Point([p.device.lng, p.device.lat])]);
      map.events.add("click", (e: atlas.MapMouseEvent) => {
        const [lng, lat] = e.position ?? [];
        if (lat === undefined || lng === undefined || latest.current.disabled) return;
        latest.current.onPick({ lat, lng });
      });
    });
    return () => {
      map.dispose();
      mapRef.current = null;
      pinSource.current = null;
      deviceSource.current = null;
    };
    // The view is created once, as the canvas `Default*` properties; the effects below follow the props.
  }, []);

  useEffect(() => {
    if (!valid(props.pin)) return;
    pinSource.current?.setShapes([new atlas.data.Feature(new atlas.data.Point([props.pin.lng, props.pin.lat]), { name: props.label })]);
  }, [props.pin, props.label]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !valid(props.pin)) return;
    const timer = setTimeout(() => {
      const position: atlas.data.Position = [props.pin.lng, props.pin.lat];
      const bounds = map.getCamera().bounds;
      if (bounds && atlas.data.BoundingBox.containsPosition(bounds, position)) return;
      map.setCamera({ center: position, type: "ease", duration: 600 });
    }, FOLLOW_PIN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [props.pin]);

  useEffect(() => {
    deviceSource.current?.setShapes(props.device ? [new atlas.data.Point([props.device.lng, props.device.lat])] : []);
  }, [props.device]);

  return (
    <div className={s.root}>
      <div ref={hostRef} className={s.host} data-map-status={status} />
      {status !== "ready" ? (
        <div className={s.status} role="status" data-testid="general-data-map-status">
          {MAP_MESSAGES[status]}
        </div>
      ) : null}
    </div>
  );
}
