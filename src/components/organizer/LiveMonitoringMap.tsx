import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, Navigation, Radio } from 'lucide-react';
import {
  Checkpoint,
  Course,
  ParticipantPublic,
  ParticipantSession,
  SessionStatus,
} from '../../types';

type MapTileStyle = 'STREET' | 'SATELLITE' | 'TOPO';

const TILE_LAYERS: Record<
  MapTileStyle,
  { label: string; url: string; attribution: string; maxZoom: number }
> = {
  STREET: {
    label: 'Peta Jalan (OSM)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  },
  SATELLITE: {
    label: 'Citra Satelit',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
  TOPO: {
    label: 'Topografi',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap',
    maxZoom: 17,
  },
};

function createStartIcon(): L.DivIcon {
  const html = `
    <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
      <svg width="36" height="36" viewBox="0 0 40 40" style="filter:drop-shadow(0 2px 5px rgba(0,0,0,0.65));">
        <polygon points="20,4 36,33 4,33" fill="rgba(16,185,129,0.28)" stroke="#10b981" stroke-width="3.5" stroke-linejoin="round" />
        <circle cx="20" cy="23" r="3" fill="#ffffff" />
      </svg>
      <div style="position:absolute;top:-15px;left:50%;transform:translateX(-50%);background:#065f46;color:#ecfdf5;border:1.5px solid #34d399;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:800;font-family:monospace;white-space:nowrap;">
        🔺 START
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'baraka-mon-start-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 21],
  });
}

function createFinishIcon(isSameAsStart: boolean): L.DivIcon {
  const offsetTop = isSameAsStart ? '34px' : '-15px';
  const html = `
    <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
      <svg width="36" height="36" viewBox="0 0 40 40" style="filter:drop-shadow(0 2px 5px rgba(0,0,0,0.65));">
        <circle cx="20" cy="20" r="16" fill="rgba(14,165,233,0.18)" stroke="#0ea5e9" stroke-width="3" />
        <circle cx="20" cy="20" r="10" fill="rgba(244,63,94,0.28)" stroke="#f43f5e" stroke-width="3" />
        <circle cx="20" cy="20" r="3" fill="#ffffff" />
      </svg>
      <div style="position:absolute;top:${offsetTop};left:50%;transform:translateX(-50%);background:#0c4a6e;color:#e0f2fe;border:1.5px solid #38bdf8;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:800;font-family:monospace;white-space:nowrap;">
        ◎ FINISH
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'baraka-mon-finish-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function createCheckpointIcon(cp: Checkpoint): L.DivIcon {
  const html = `
    <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
      <svg width="32" height="32" viewBox="0 0 40 40" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.65));">
        <circle cx="20" cy="20" r="13" fill="rgba(217,70,239,0.20)" stroke="#d946ef" stroke-width="3" />
        <circle cx="20" cy="20" r="2.5" fill="#ffffff" />
      </svg>
      <div style="position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:#4a044e;color:#fdf4ff;border:1px solid #f0abfc;border-radius:4px;padding:0px 4px;font-size:8px;font-weight:800;font-family:monospace;white-space:nowrap;">
        #${cp.orderIndex} ${cp.code}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'baraka-mon-cp-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function createParticipantMarkerIcon(params: {
  teamLabel: string;
  bibNumber: string;
  status: SessionStatus;
  isStale: boolean;
  isSelected: boolean;
}): L.DivIcon {
  const { teamLabel, bibNumber, status, isStale, isSelected } = params;
  const dotColor =
    status === SessionStatus.FINISHED
      ? '#38bdf8'
      : isStale
      ? '#f59e0b'
      : '#10b981';
  const badgeBg =
    status === SessionStatus.FINISHED
      ? '#0c4a6e'
      : isStale
      ? '#78350f'
      : '#064e3b';
  const badgeBorder = isSelected
    ? '#ffffff'
    : status === SessionStatus.FINISHED
    ? '#38bdf8'
    : isStale
    ? '#fbbf24'
    : '#34d399';
  const ringScale = isSelected ? 'scale(1.15)' : 'scale(1)';

  const html = `
    <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;transform:${ringScale};transition:transform 0.2s;">
      <div style="width:20px;height:20px;border-radius:9999px;background:${dotColor};border:3px solid #ffffff;box-shadow:0 0 12px ${dotColor};"></div>
      <div style="position:absolute;bottom:-17px;left:50%;transform:translateX(-50%);background:${badgeBg};color:#ffffff;border:1.5px solid ${badgeBorder};border-radius:5px;padding:1px 6px;font-size:9px;font-weight:800;font-family:monospace;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.65);">
        ${teamLabel}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'baraka-mon-runner-icon',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

export interface ResolvedRunnerPosition {
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  sourceLabel: string;
  measuredAt?: string;
  isStale: boolean;
}

export function resolveSessionPositionOnCourse(
  sess: ParticipantSession,
  course?: Course | null,
  nowMs: number = Date.now()
): ResolvedRunnerPosition | null {
  // 1. Prioritas utama: Posisi GPS terakhir dari telemetri berkala (tiap 2 menit) atau saat scan pos
  if (
    sess.lastLocation &&
    typeof sess.lastLocation.latitude === 'number' &&
    typeof sess.lastLocation.longitude === 'number' &&
    !Number.isNaN(sess.lastLocation.latitude) &&
    !Number.isNaN(sess.lastLocation.longitude)
  ) {
    const ageMs = sess.lastLocation.measuredAt
      ? nowMs - Date.parse(sess.lastLocation.measuredAt)
      : 0;
    const isStale = ageMs > 3 * 60 * 1000;
    return {
      sessionId: sess.id,
      latitude: sess.lastLocation.latitude,
      longitude: sess.lastLocation.longitude,
      accuracyMeters: sess.lastLocation.accuracyMeters,
      sourceLabel: 'GPS Real-Time (Tiap 2 Menit / Scan)',
      measuredAt: sess.lastLocation.measuredAt,
      isStale,
    };
  }

  if (!course) return null;

  // 2. Fallback cerdas: Jika sudah Finish dan ada koordinat Finish
  if (sess.status === SessionStatus.FINISHED && course.finishLocation) {
    return {
      sessionId: sess.id,
      latitude: course.finishLocation.latitude,
      longitude: course.finishLocation.longitude,
      sourceLabel: 'Posisi Garis Finish',
      measuredAt: sess.finishedAt,
      isStale: false,
    };
  }

  // 3. Fallback cerdas: Gunakan titik Pos Checkpoint terakhir yang baru saja di-scan peserta
  if (
    Array.isArray(sess.validatedCheckpointIds) &&
    sess.validatedCheckpointIds.length > 0
  ) {
    const lastCpId =
      sess.validatedCheckpointIds[sess.validatedCheckpointIds.length - 1];
    const cp = course.checkpoints.find((c) => c.id === lastCpId);
    if (cp) {
      return {
        sessionId: sess.id,
        latitude: cp.latitude,
        longitude: cp.longitude,
        sourceLabel: `Terakhir Scan di Pos #${cp.orderIndex} (${cp.code})`,
        measuredAt: sess.startedAt,
        isStale: false,
      };
    }
  }

  // 4. Fallback cerdas: Jika baru saja Scan Start dan Course memiliki titik Start
  if (sess.status === SessionStatus.ACTIVE && course.startLocation) {
    return {
      sessionId: sess.id,
      latitude: course.startLocation.latitude,
      longitude: course.startLocation.longitude,
      sourceLabel: 'Baru Berangkat dari Titik Start',
      measuredAt: sess.startedAt,
      isStale: false,
    };
  }

  return null;
}

interface LiveMonitoringMapProps {
  course: Course | null;
  sessions: ParticipantSession[];
  participants: ParticipantPublic[];
  focusedSessionId: string | null;
  onSelectSession?: (sessionId: string) => void;
  nowTick: number;
}

export function LiveMonitoringMap({
  course,
  sessions,
  participants,
  focusedSessionId,
  onSelectSession,
  nowTick,
}: LiveMonitoringMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const runnerMarkersRef = useRef<Record<string, L.Marker>>({});
  const lastFittedCourseIdRef = useRef<string | null>(null);

  const [tileStyle, setTileStyle] = useState<MapTileStyle>('STREET');

  // Inisialisasi peta
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const firstCp = course?.checkpoints[0];
    const defaultLat =
      course?.startLocation?.latitude ?? firstCp?.latitude ?? -6.8584;
    const defaultLng =
      course?.startLocation?.longitude ?? firstCp?.longitude ?? 107.6305;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 15,
      zoomControl: true,
    });

    const cfg = TILE_LAYERS[tileStyle];
    const layer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    tileLayerRef.current = layer;
    overlayGroupRef.current = group;

    window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      overlayGroupRef.current = null;
    };
  }, []);

  // Ganti style tile peta
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const cfg = TILE_LAYERS[tileStyle];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(map);
  }, [tileStyle]);

  // Render lintasan Course & marker seluruh peserta aktif/selesai
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = overlayGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    runnerMarkersRef.current = {};
    const boundsPoints: L.LatLngExpression[] = [];

    if (course) {
      const sortedCps = [...course.checkpoints].sort(
        (a, b) => a.orderIndex - b.orderIndex
      );

      if (course.enforceOrder) {
        const linePts: L.LatLngExpression[] = [];
        if (course.startLocation) {
          linePts.push([
            course.startLocation.latitude,
            course.startLocation.longitude,
          ]);
        }
        for (const cp of sortedCps) {
          linePts.push([cp.latitude, cp.longitude]);
        }
        if (course.finishLocation) {
          linePts.push([
            course.finishLocation.latitude,
            course.finishLocation.longitude,
          ]);
        }
        if (linePts.length >= 2) {
          L.polyline(linePts, {
            color: '#f59e0b',
            weight: 2.5,
            opacity: 0.65,
            dashArray: '7, 6',
          }).addTo(group);
        }
      }

      if (course.startLocation) {
        const pos: [number, number] = [
          course.startLocation.latitude,
          course.startLocation.longitude,
        ];
        boundsPoints.push(pos);
        L.marker(pos, { icon: createStartIcon() })
          .bindPopup(`<strong>🔺 START — ${course.name}</strong>`)
          .addTo(group);
      }

      if (course.finishLocation) {
        const isSame = Boolean(
          course.startLocation &&
            Math.abs(
              course.startLocation.latitude - course.finishLocation.latitude
            ) < 0.00008 &&
            Math.abs(
              course.startLocation.longitude - course.finishLocation.longitude
            ) < 0.00008
        );
        const pos: [number, number] = [
          course.finishLocation.latitude,
          course.finishLocation.longitude,
        ];
        boundsPoints.push(pos);
        L.marker(pos, { icon: createFinishIcon(isSame) })
          .bindPopup(`<strong>◎ FINISH — ${course.name}</strong>`)
          .addTo(group);
      }

      for (const cp of sortedCps) {
        const pos: [number, number] = [cp.latitude, cp.longitude];
        boundsPoints.push(pos);
        L.marker(pos, { icon: createCheckpointIcon(cp) })
          .bindPopup(
            `<div style="font-family:sans-serif;font-size:12px;">
              <strong>Pos #${cp.orderIndex} — ${cp.code}</strong>
              ${cp.name ? `<br/><span>${cp.name}</span>` : ''}
              <br/><span>Poin: ${cp.points} pts</span>
            </div>`
          )
          .addTo(group);
      }
    }

    // Plot setiap peserta yang memiliki posisi GPS atau posisi pos terakhir
    sessions.forEach((sess, idx) => {
      const resolved = resolveSessionPositionOnCourse(sess, course, nowTick);
      if (!resolved) return;

      const participant = participants.find((p) => p.id === sess.participantId);
      const teamLabel = participant?.teamName || participant?.name || 'Tim';
      const bibNumber = participant?.bibNumber || '?';

      // Beri sedikit jitter mikro jika 2 peserta berada di titik pos yang persis sama agar kedua pin terlihat
      const jitterLat =
        !sess.lastLocation && sessions.length > 1
          ? Math.sin(idx * 1.9) * 0.00004
          : 0;
      const jitterLng =
        !sess.lastLocation && sessions.length > 1
          ? Math.cos(idx * 1.9) * 0.00004
          : 0;

      const pos: [number, number] = [
        resolved.latitude + jitterLat,
        resolved.longitude + jitterLng,
      ];
      boundsPoints.push(pos);

      const marker = L.marker(pos, {
        icon: createParticipantMarkerIcon({
          teamLabel,
          bibNumber,
          status: sess.status,
          isStale: resolved.isStale,
          isSelected: focusedSessionId === sess.id,
        }),
        zIndexOffset: focusedSessionId === sess.id ? 1000 : 500,
      });

      const cpTotal = course?.checkpoints.length || 0;
      const popupHtml = `
        <div style="font-family:sans-serif;font-size:12px;line-height:1.45;min-width:185px;">
          <div style="font-weight:800;font-size:13px;color:#0f172a;">
            ${teamLabel}
          </div>
          <div style="color:#334155;font-size:11px;">
            Pendaftar: <strong>${participant?.name || '-'}</strong>
          </div>
          <hr style="margin:5px 0;border-color:#e2e8f0;" />
          <div>Status: <strong>${sess.status}</strong></div>
          <div>Progres Pos: <strong>${
            sess.validatedCheckpointIds.length
          } / ${cpTotal} CP</strong></div>
          <div>Skor: <strong>${sess.totalScore} pts</strong></div>
          <div style="margin-top:4px;font-size:11px;color:#0369a1;font-weight:600;">
            📍 ${resolved.sourceLabel}
          </div>
          <div style="font-family:monospace;font-size:10px;color:#64748b;">
            ${resolved.latitude.toFixed(5)}, ${resolved.longitude.toFixed(5)}
            ${
              resolved.accuracyMeters
                ? ` (±${Math.round(resolved.accuracyMeters)}m)`
                : ''
            }
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        onSelectSession?.(sess.id);
      });
      marker.addTo(group);
      runnerMarkersRef.current[sess.id] = marker;
    });

    const currentCourseId = course?.id || 'ALL';
    if (
      lastFittedCourseIdRef.current !== currentCourseId &&
      boundsPoints.length > 0
    ) {
      lastFittedCourseIdRef.current = currentCourseId;
      map.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [42, 42],
        maxZoom: 17,
      });
    }
  }, [course, sessions, participants, focusedSessionId, nowTick, onSelectSession]);

  // Saat Organizer mengklik kartu peserta, fokuskan (flyTo) peta ke marker peserta tersebut
  useEffect(() => {
    if (!focusedSessionId) return;
    const map = mapInstanceRef.current;
    const marker = runnerMarkersRef.current[focusedSessionId];
    if (map && marker) {
      const latLng = marker.getLatLng();
      map.flyTo(latLng, Math.max(map.getZoom(), 17), { duration: 0.65 });
      marker.openPopup();
    }
  }, [focusedSessionId]);

  const handleFitAll = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const pts: L.LatLngExpression[] = [];
    if (course?.startLocation) {
      pts.push([
        course.startLocation.latitude,
        course.startLocation.longitude,
      ]);
    }
    if (course?.finishLocation) {
      pts.push([
        course.finishLocation.latitude,
        course.finishLocation.longitude,
      ]);
    }
    for (const cp of course?.checkpoints || []) {
      pts.push([cp.latitude, cp.longitude]);
    }
    for (const sess of sessions) {
      const resolved = resolveSessionPositionOnCourse(sess, course, nowTick);
      if (resolved) {
        pts.push([resolved.latitude, resolved.longitude]);
      }
    }
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [42, 42], maxZoom: 17 });
    }
  };

  const trackedCount = sessions.filter(
    (s) => resolveSessionPositionOnCourse(s, course, nowTick) !== null
  ).length;

  return (
    <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Radio className="h-4 w-4 animate-pulse" />
          </span>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span>Peta Live Monitoring Pergerakan Peserta</span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-mono text-emerald-300 border border-emerald-500/30">
                {trackedCount} Peserta Terlacak di Peta
              </span>
            </div>
            <div className="text-xs text-slate-400">
              Update posisi otomatis setiap <strong>5 menit</strong> (hemat baterai &amp; kuota) serta setiap kali peserta melakukan <strong>Scan Pos</strong>.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 border border-slate-800">
            {(['STREET', 'SATELLITE', 'TOPO'] as MapTileStyle[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setTileStyle(st)}
                className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                  tileStyle === st
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {TILE_LAYERS[st].label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleFitAll}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition"
          >
            <Crosshair className="h-3.5 w-3.5 text-emerald-400" />
            Pusatkan Peta &amp; Peserta
          </button>
        </div>
      </div>

      {/* Kanvas Peta */}
      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div ref={mapContainerRef} className="h-[380px] sm:h-[440px] w-full z-10" />
      </div>

      {/* Legenda Status Marker Peserta */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 pt-1">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-500 border border-white inline-block" />
            Sedang Lari (Aktif / Fresh)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-500 border border-white inline-block" />
            Sinyal GPS &gt; 6 Menit (Stale)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-sky-400 border border-white inline-block" />
            Sudah Finish
          </span>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center gap-1">
          <Navigation className="h-3.5 w-3.5 text-sky-400" />
          Klik tombol <strong>"Lihat di Peta"</strong> pada kartu peserta di bawah untuk menyorot posisi peserta.
        </div>
      </div>
    </div>
  );
}
