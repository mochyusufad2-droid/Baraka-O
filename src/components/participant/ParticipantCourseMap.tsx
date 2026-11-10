import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Compass, Crosshair, Layers, Navigation } from 'lucide-react';
import { Checkpoint, Course, ValidationMethod } from '../../types';

type MapTileStyle = 'STREET' | 'SATELLITE' | 'TOPO';

const TILE_LAYERS: Record<
  MapTileStyle,
  { label: string; url: string; attribution: string; maxZoom: number }
> = {
  STREET: {
    label: 'Peta Jalan',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  },
  SATELLITE: {
    label: 'Satelit',
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
    className: 'baraka-participant-start-icon',
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
    className: 'baraka-participant-finish-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function createCheckpointIcon(
  cp: Checkpoint,
  isDone: boolean,
  isNextTarget: boolean
): L.DivIcon {
  const strokeColor = isDone
    ? '#10b981'
    : isNextTarget
    ? '#f59e0b'
    : '#d946ef';
  const fillColor = isDone
    ? 'rgba(16,185,129,0.32)'
    : isNextTarget
    ? 'rgba(245,158,11,0.30)'
    : 'rgba(217,70,239,0.22)';
  const badgeBg = isDone
    ? '#065f46'
    : isNextTarget
    ? '#78350f'
    : '#4a044e';
  const badgeBorder = isDone
    ? '#34d399'
    : isNextTarget
    ? '#fbbf24'
    : '#f0abfc';

  const html = `
    <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
      <svg width="36" height="36" viewBox="0 0 40 40" style="filter:drop-shadow(0 2px 5px rgba(0,0,0,0.65));">
        <circle cx="20" cy="20" r="14" fill="${fillColor}" stroke="${strokeColor}" stroke-width="3.5" />
        <circle cx="20" cy="20" r="3" fill="#ffffff" />
      </svg>
      <div style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:${badgeBg};color:#ffffff;border:1.5px solid ${badgeBorder};border-radius:4px;padding:0px 5px;font-size:9px;font-weight:800;font-family:monospace;white-space:nowrap;">
        ${isDone ? '✓ ' : ''}#${cp.orderIndex} ${cp.code}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'baraka-participant-cp-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function createRunnerSelfIcon(): L.DivIcon {
  const html = `
    <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
      <div style="width:18px;height:18px;border-radius:9999px;background:#38bdf8;border:3px solid #ffffff;box-shadow:0 0 12px rgba(56,189,248,0.95);"></div>
      <div style="position:absolute;bottom:-15px;left:50%;transform:translateX(-50%);background:#0284c7;color:#ffffff;border:1px solid #bae6fd;border-radius:4px;padding:0px 4px;font-size:8px;font-weight:800;font-family:monospace;white-space:nowrap;">
        ANDA
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'baraka-runner-self-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

interface ParticipantCourseMapProps {
  course: Course;
  validatedCheckpointIds: string[];
  runnerCoords: {
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null;
  onRefreshGps?: () => void;
  isReadingGps?: boolean;
}

export function ParticipantCourseMap({
  course,
  validatedCheckpointIds,
  runnerCoords,
  onRefreshGps,
  isReadingGps,
}: ParticipantCourseMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const runnerGroupRef = useRef<L.LayerGroup | null>(null);
  const runnerMarkerRef = useRef<L.Marker | null>(null);
  const runnerCircleRef = useRef<L.Circle | null>(null);
  const hasInitialFitRef = useRef<boolean>(false);
  const pendingFlyToRunnerRef = useRef<boolean>(false);

  const [tileStyle, setTileStyle] = useState<MapTileStyle>('STREET');
  const [autoFollowRunner, setAutoFollowRunner] = useState<boolean>(false);

  // Inisialisasi peta Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const firstCp = course.checkpoints[0];
    const defaultLat =
      course.startLocation?.latitude ?? firstCp?.latitude ?? -6.8584;
    const defaultLng =
      course.startLocation?.longitude ?? firstCp?.longitude ?? 107.6305;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 16,
      zoomControl: true,
    });

    // Jika peserta menggeser peta secara manual dengan jari, matikan auto-follow agar tidak melawan jari peserta
    map.on('dragstart', () => {
      setAutoFollowRunner(false);
    });

    const cfg = TILE_LAYERS[tileStyle];
    const layer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(map);

    const overlayGroup = L.layerGroup().addTo(map);
    const runnerGroup = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    tileLayerRef.current = layer;
    overlayGroupRef.current = overlayGroup;
    runnerGroupRef.current = runnerGroup;

    window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      overlayGroupRef.current = null;
      runnerGroupRef.current = null;
      runnerMarkerRef.current = null;
      runnerCircleRef.current = null;
      hasInitialFitRef.current = false;
    };
  }, []);

  // Ganti tile style peta
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

  // Render marker Start, Checkpoint, Finish, dan Garis Urutan (Hanya di-render ulang jika course/checkpoint berubah)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = overlayGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: L.LatLngExpression[] = [];

    const sortedCps = [...course.checkpoints].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );
    const nextTargetCp = course.enforceOrder
      ? sortedCps.find((c) => !validatedCheckpointIds.includes(c.id))
      : undefined;

    // 1. Garis Rute Urutan (jika Wajib Urut)
    if (course.enforceOrder) {
      const routeCoords: L.LatLngExpression[] = [];
      if (course.startLocation) {
        routeCoords.push([
          course.startLocation.latitude,
          course.startLocation.longitude,
        ]);
      }
      for (const cp of sortedCps) {
        routeCoords.push([cp.latitude, cp.longitude]);
      }
      if (course.finishLocation) {
        routeCoords.push([
          course.finishLocation.latitude,
          course.finishLocation.longitude,
        ]);
      }
      if (routeCoords.length >= 2) {
        L.polyline(routeCoords, {
          color: '#f59e0b',
          weight: 3,
          opacity: 0.75,
          dashArray: '8, 6',
        }).addTo(group);
      }
    }

    // 2. Titik START
    if (course.startLocation) {
      const pos: [number, number] = [
        course.startLocation.latitude,
        course.startLocation.longitude,
      ];
      boundsPoints.push(pos);
      L.marker(pos, { icon: createStartIcon() })
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;">
            <strong>🔺 TITIK START</strong><br/>
            <span>${course.startLocation.name || course.name}</span>
          </div>`
        )
        .addTo(group);
    }

    // 3. Titik FINISH
    if (course.finishLocation) {
      const isSameAsStart = Boolean(
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
      L.marker(pos, { icon: createFinishIcon(isSameAsStart) })
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;">
            <strong>◎ TITIK FINISH</strong><br/>
            <span>${course.finishLocation.name || course.name}</span>
          </div>`
        )
        .addTo(group);
    }

    // 4. Seluruh Checkpoint
    for (const cp of sortedCps) {
      const isDone = validatedCheckpointIds.includes(cp.id);
      const isNext = nextTargetCp?.id === cp.id;
      const pos: [number, number] = [cp.latitude, cp.longitude];
      boundsPoints.push(pos);

      // Tampilkan lingkaran radius GPS jika course menggunakan validasi GPS
      if (course.validationMethod !== ValidationMethod.QR_ONLY) {
        const radius = cp.radiusMeters || course.defaultGpsRadiusMeters || 35;
        L.circle(pos, {
          radius,
          color: isDone ? '#10b981' : isNext ? '#f59e0b' : '#d946ef',
          fillColor: isDone ? '#10b981' : isNext ? '#f59e0b' : '#d946ef',
          fillOpacity: 0.1,
          weight: 1.5,
        }).addTo(group);
      }

      L.marker(pos, { icon: createCheckpointIcon(cp, isDone, isNext) })
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;line-height:1.4;">
            <strong>Pos #${cp.orderIndex} — ${cp.code}</strong>
            ${cp.name ? `<br/><span>${cp.name}</span>` : ''}
            <br/><span style="color:#059669;font-weight:bold;">Poin: ${cp.points} pts</span>
            <br/><span>Status: <strong>${
              isDone
                ? '✅ Sudah Tercatat'
                : isNext
                ? '🎯 Target Berikutnya'
                : 'Belum Dikunjungi'
            }</strong></span>
          </div>`
        )
        .addTo(group);
    }

    if (!hasInitialFitRef.current && boundsPoints.length > 0) {
      hasInitialFitRef.current = true;
      if (runnerCoords) {
        boundsPoints.push([runnerCoords.latitude, runnerCoords.longitude]);
      }
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
    }
  }, [course, validatedCheckpointIds]);

  // 5. Update Posisi Peserta Secara Mulus (Real-time In-Place tanpa menghapus marker pos lain)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const runnerGroup = runnerGroupRef.current;
    if (!map || !runnerGroup) return;

    if (!runnerCoords) {
      runnerGroup.clearLayers();
      runnerMarkerRef.current = null;
      runnerCircleRef.current = null;
      return;
    }

    const myPos: [number, number] = [
      runnerCoords.latitude,
      runnerCoords.longitude,
    ];
    const accuracy = Math.round(runnerCoords.accuracy || 10);
    const popupHtml = `<div style="font-family:sans-serif;font-size:12px;">
      <strong>📍 POSISI ANDA SAAT INI (LIVE)</strong><br/>
      <span>Akurasi GPS: ±${accuracy}m</span>
    </div>`;

    // Update atau buat lingkaran akurasi
    if (accuracy > 0 && accuracy <= 200) {
      if (runnerCircleRef.current) {
        runnerCircleRef.current.setLatLng(myPos);
        runnerCircleRef.current.setRadius(accuracy);
      } else {
        runnerCircleRef.current = L.circle(myPos, {
          radius: accuracy,
          color: '#38bdf8',
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(runnerGroup);
      }
    } else if (runnerCircleRef.current) {
      runnerGroup.removeLayer(runnerCircleRef.current);
      runnerCircleRef.current = null;
    }

    // Update atau buat marker titik biru ANDA secara in-place
    if (runnerMarkerRef.current) {
      runnerMarkerRef.current.setLatLng(myPos);
      runnerMarkerRef.current.getPopup()?.setContent(popupHtml);
    } else {
      runnerMarkerRef.current = L.marker(myPos, {
        icon: createRunnerSelfIcon(),
        zIndexOffset: 1000,
      })
        .bindPopup(popupHtml)
        .addTo(runnerGroup);
    }

    // Jika peserta baru saja menekan tombol "Posisi Saya", terbangkan kamera ke titik terbaru
    if (pendingFlyToRunnerRef.current) {
      pendingFlyToRunnerRef.current = false;
      map.flyTo(myPos, Math.max(map.getZoom(), 17), {
        duration: 0.6,
      });
    } else if (autoFollowRunner) {
      map.panTo(myPos, { animate: true, duration: 0.4 });
    }
  }, [runnerCoords, autoFollowRunner]);

  const handleFitCourseBounds = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setAutoFollowRunner(false);
    const pts: L.LatLngExpression[] = [];
    if (course.startLocation) {
      pts.push([
        course.startLocation.latitude,
        course.startLocation.longitude,
      ]);
    }
    if (course.finishLocation) {
      pts.push([
        course.finishLocation.latitude,
        course.finishLocation.longitude,
      ]);
    }
    for (const cp of course.checkpoints) {
      pts.push([cp.latitude, cp.longitude]);
    }
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 17 });
    }
  };

  const handleFocusMyLocation = () => {
    const map = mapInstanceRef.current;
    pendingFlyToRunnerRef.current = true;
    setAutoFollowRunner(true);
    if (runnerCoords && map) {
      map.flyTo(
        [runnerCoords.latitude, runnerCoords.longitude],
        Math.max(map.getZoom(), 17),
        {
          duration: 0.6,
        }
      );
    }
    // Selalu panggil pembacaan GPS segar agar titik langsung diperbarui detik itu juga
    onRefreshGps?.();
  };

  return (
    <div className="space-y-2.5">
      {/* Toolbar Peta Peserta */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-950 p-1 border border-slate-800">
          {(['STREET', 'SATELLITE', 'TOPO'] as MapTileStyle[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setTileStyle(st)}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                tileStyle === st
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {TILE_LAYERS[st].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleFitCourseBounds}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-slate-200"
          >
            <Crosshair className="h-3.5 w-3.5 text-amber-400" />
            Lihat Semua Pos
          </button>
          <button
            type="button"
            onClick={handleFocusMyLocation}
            disabled={isReadingGps}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
              autoFollowRunner
                ? 'bg-sky-500/30 border-sky-400 text-white shadow-sm'
                : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/30 text-sky-300'
            }`}
          >
            <Navigation
              className={`h-3.5 w-3.5 ${
                autoFollowRunner ? 'text-sky-300 animate-pulse' : ''
              }`}
            />
            {isReadingGps
              ? 'Mencari GPS...'
              : autoFollowRunner
              ? 'Mengikuti Anda'
              : 'Posisi Saya'}
          </button>
        </div>
      </div>

      {/* Kanvas Peta Interaktif */}
      <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-inner">
        <div
          ref={mapContainerRef}
          className="h-[340px] sm:h-[400px] w-full z-10"
        />
        {runnerCoords && (
          (() => {
            const acc = Math.round(runnerCoords.accuracy || 10);
            const isGood = acc <= 10;
            const isFair = acc > 10 && acc <= 25;
            const dotColor = isGood
              ? 'bg-emerald-400'
              : isFair
              ? 'bg-amber-400'
              : 'bg-rose-400';
            const badgeBg = isGood
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : isFair
              ? 'bg-amber-950/90 border-amber-500/50 text-amber-200'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200';
            const statusLabel = isGood
              ? 'Sinyal Mantap'
              : isFair
              ? 'Akurasi Cukup'
              : 'Mencari Satelit';

            return (
              <div
                className={`pointer-events-none absolute bottom-2.5 left-2.5 z-20 flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[10px] font-mono shadow-lg backdrop-blur-sm ${badgeBg}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${dotColor} animate-pulse`} />
                <span>
                  GPS ±{acc}m • <strong>{statusLabel}</strong>
                </span>
              </div>
            );
          })()
        )}
      </div>

      {/* Legenda Ringkas */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/90 border border-slate-800 px-3 py-2 text-[11px] text-slate-300">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />
            Sudah Tercatat
          </span>
          {course.enforceOrder && (
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" />
              Target Berikutnya
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-fuchsia-500 inline-block" />
            Belum Dikunjungi
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400 inline-block" />
            Posisi Anda (Real-time)
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-slate-400">
          <Compass className="h-3 w-3 text-amber-400" />
          Ketuk titik pos untuk info detail
        </span>
      </div>
    </div>
  );
}
