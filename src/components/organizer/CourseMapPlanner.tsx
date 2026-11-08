import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Compass,
  Crosshair,
  Layers,
  MapPin,
  Navigation,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  Checkpoint,
  Course,
  GeoPointLocation,
  ValidationMethod,
} from '../../types';

export type MapClickMode = 'CP' | 'START' | 'FINISH';
export type MapTileStyle = 'STREET' | 'SATELLITE' | 'TOPO';

interface CourseMapPlannerProps {
  course: Course;
  draftCpCode: string;
  draftCpName: string;
  draftCpLat: string;
  draftCpLng: string;
  draftCpRadiusMeters: number;
  editingCheckpointId: string | null;
  readOnly?: boolean;
  onPickCpCoordinates: (lat: number, lng: number) => void;
  onUpdateStartLocation: (loc: GeoPointLocation | null) => Promise<void>;
  onUpdateFinishLocation: (loc: GeoPointLocation | null) => Promise<void>;
  onSelectCheckpointForEdit: (cp: Checkpoint) => void;
  onDragCheckpointCoordinates?: (
    cp: Checkpoint,
    lat: number,
    lng: number
  ) => Promise<void>;
}

const TILE_LAYERS: Record<
  MapTileStyle,
  { label: string; url: string; attribution: string; maxZoom: number }
> = {
  STREET: {
    label: 'Peta Jalan (OSM)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  SATELLITE: {
    label: 'Citra Satelit',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
  TOPO: {
    label: 'Topografi (Kontur)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
  },
};

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Simbol Standar IOF Orienteering:
 * - START: Segitiga Sama Sisi (🔺) Hijau Emerald
 * - CHECKPOINT (CP): Lingkaran Tunggal (⭕) Ungu/Magenta atau Amber dengan Nomor Urut
 * - FINISH: Lingkaran Ganda Konsentris (◎) Biru/Merah
 */
function createStartTriangleIcon(): L.DivIcon {
  const html = `
    <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
      <svg width="40" height="40" viewBox="0 0 40 40" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.65));">
        <polygon points="20,4 36,33 4,33" fill="rgba(16,185,129,0.28)" stroke="#10b981" stroke-width="3.5" stroke-linejoin="round" />
        <circle cx="20" cy="23" r="3" fill="#ffffff" />
      </svg>
      <div style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);background:#065f46;color:#ecfdf5;border:1.5px solid #34d399;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:800;font-family:monospace;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.5);">
        🔺 START
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'baraka-iof-start-icon',
    iconSize: [44, 44],
    iconAnchor: [22, 23],
  });
}

function createFinishDoubleCircleIcon(isSameAsStart: boolean): L.DivIcon {
  const offsetTop = isSameAsStart ? '36px' : '-16px';
  const html = `
    <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
      <svg width="40" height="40" viewBox="0 0 40 40" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.65));">
        <circle cx="20" cy="20" r="16" fill="rgba(14,165,233,0.18)" stroke="#0ea5e9" stroke-width="3" />
        <circle cx="20" cy="20" r="10" fill="rgba(244,63,94,0.28)" stroke="#f43f5e" stroke-width="3" />
        <circle cx="20" cy="20" r="3" fill="#ffffff" />
      </svg>
      <div style="position:absolute;top:${offsetTop};left:50%;transform:translateX(-50%);background:#0c4a6e;color:#e0f2fe;border:1.5px solid #38bdf8;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:800;font-family:monospace;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.5);">
        ◎ FINISH
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'baraka-iof-finish-icon',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function createCheckpointCircleIcon(
  cp: Checkpoint,
  isEditing: boolean
): L.DivIcon {
  const strokeColor = isEditing ? '#f59e0b' : '#d946ef';
  const fillBg = isEditing
    ? 'rgba(245,158,11,0.32)'
    : 'rgba(217,70,239,0.22)';
  const badgeBg = isEditing ? '#78350f' : '#4a044e';
  const badgeBorder = isEditing ? '#fbbf24' : '#e879f9';
  const labelText = cp.name
    ? `#${cp.orderIndex} ${cp.code}`
    : `#${cp.orderIndex} ${cp.code}`;

  const html = `
    <div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;">
      <svg width="38" height="38" viewBox="0 0 38 38" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.65));">
        <circle cx="19" cy="19" r="14" fill="${fillBg}" stroke="${strokeColor}" stroke-width="3.5" />
        <circle cx="19" cy="19" r="2.8" fill="#ffffff" />
      </svg>
      <div style="position:absolute;top:-15px;left:50%;transform:translateX(-50%);background:${badgeBg};color:#ffffff;border:1.5px solid ${badgeBorder};border-radius:4px;padding:1px 5px;font-size:9.5px;font-weight:800;font-family:monospace;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.55);">
        ⭕ ${labelText}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'baraka-iof-cp-icon',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function createDraftCpIcon(codeLabel: string, isEditing: boolean): L.DivIcon {
  const title = isEditing
    ? `POSISI BARU ${codeLabel || 'CP'}`
    : `CALON ${codeLabel || 'CP BARU'}`;
  const html = `
    <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
      <svg width="36" height="36" viewBox="0 0 36 36" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.7));">
        <circle cx="18" cy="18" r="13" fill="rgba(245,158,11,0.25)" stroke="#fbbf24" stroke-width="3" stroke-dasharray="4 3" />
        <circle cx="18" cy="18" r="3.5" fill="#fbbf24" />
      </svg>
      <div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);background:#78350f;color:#fef3c7;border:1px solid #fbbf24;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:800;font-family:monospace;white-space:nowrap;">
        🎯 ${title}
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'baraka-iof-draft-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export function CourseMapPlanner({
  course,
  draftCpCode,
  draftCpLat,
  draftCpLng,
  draftCpRadiusMeters,
  editingCheckpointId,
  readOnly = false,
  onPickCpCoordinates,
  onUpdateStartLocation,
  onUpdateFinishLocation,
  onSelectCheckpointForEdit,
  onDragCheckpointCoordinates,
}: CourseMapPlannerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const lastFittedCourseIdRef = useRef<string>('');

  const [clickMode, setClickMode] = useState<MapClickMode>('CP');
  const [tileStyle, setTileStyle] = useState<MapTileStyle>('STREET');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [isSavingPoint, setIsSavingPoint] = useState<boolean>(false);

  // Pelindung status Drag agar layer peta tidak pernah di-reset/clear saat user sedang menahan & menggeser marker
  const isDraggingRef = useRef<boolean>(false);
  const [dragFinishedTick, setDragFinishedTick] = useState<number>(0);

  // Simpan seluruh callback di dalam ref agar re-render 1 detik dari parent (stopwatch) tidak memicu clearLayers()
  const callbacksRef = useRef({
    onPickCpCoordinates,
    onUpdateStartLocation,
    onUpdateFinishLocation,
    onSelectCheckpointForEdit,
    onDragCheckpointCoordinates,
  });
  callbacksRef.current = {
    onPickCpCoordinates,
    onUpdateStartLocation,
    onUpdateFinishLocation,
    onSelectCheckpointForEdit,
    onDragCheckpointCoordinates,
  };

  // Saat user memilih Pos (CP) untuk diedit, otomatis pastikan mode klik peta berada di mode CP
  useEffect(() => {
    if (editingCheckpointId) {
      setClickMode('CP');
    }
  }, [editingCheckpointId]);

  // Simpan referensi callback terbaru agar event listener klik peta selalu menggunakan state terkini
  const clickHandlerRef = useRef<(lat: number, lng: number) => void>(() => {});
  clickHandlerRef.current = async (lat: number, lng: number) => {
    if (readOnly || isDraggingRef.current) return;
    const roundedLat = Number(lat.toFixed(6));
    const roundedLng = Number(lng.toFixed(6));

    if (clickMode === 'CP' || editingCheckpointId) {
      callbacksRef.current.onPickCpCoordinates(roundedLat, roundedLng);
      return;
    }

    if (clickMode === 'START') {
      setIsSavingPoint(true);
      try {
        await callbacksRef.current.onUpdateStartLocation({
          latitude: roundedLat,
          longitude: roundedLng,
          name: 'Titik Start',
        });
      } finally {
        setIsSavingPoint(false);
      }
      return;
    }

    if (clickMode === 'FINISH') {
      setIsSavingPoint(true);
      try {
        await callbacksRef.current.onUpdateFinishLocation({
          latitude: roundedLat,
          longitude: roundedLng,
          name: 'Titik Finish',
        });
      } finally {
        setIsSavingPoint(false);
      }
    }
  };

  // Hitung total estimasi jarak garis lurus lintasan (START -> CP1 -> ... -> FINISH)
  const totalRouteMeters = React.useMemo(() => {
    const pts: Array<{ lat: number; lng: number }> = [];
    if (course.startLocation) {
      pts.push({
        lat: course.startLocation.latitude,
        lng: course.startLocation.longitude,
      });
    }
    const sorted = [...course.checkpoints].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );
    sorted.forEach((cp) => {
      pts.push({ lat: cp.latitude, lng: cp.longitude });
    });
    if (course.finishLocation) {
      pts.push({
        lat: course.finishLocation.latitude,
        lng: course.finishLocation.longitude,
      });
    }
    if (pts.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < pts.length; i++) {
      sum += calculateDistanceMeters(
        pts[i - 1].lat,
        pts[i - 1].lng,
        pts[i].lat,
        pts[i].lng
      );
    }
    return Math.round(sum);
  }, [course.startLocation, course.finishLocation, course.checkpoints]);

  // Signature deterministik geometri course agar polling 6 detik tidak me-reset layer peta jika koordinat tidak berubah
  const courseMapSignature = React.useMemo(() => {
    const startSig = course.startLocation
      ? `${course.startLocation.latitude.toFixed(6)},${course.startLocation.longitude.toFixed(6)}`
      : 'none';
    const finishSig = course.finishLocation
      ? `${course.finishLocation.latitude.toFixed(6)},${course.finishLocation.longitude.toFixed(6)}`
      : 'none';
    const cpSig = [...course.checkpoints]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(
        (cp) =>
          `${cp.id}:${cp.code}:${cp.name || ''}:${cp.orderIndex}:${cp.latitude.toFixed(
            6
          )},${cp.longitude.toFixed(6)}:${cp.radiusMeters}:${cp.points}`
      )
      .join('|');
    return `${course.id}::${course.enforceOrder}::${course.validationMethod}::${course.defaultGpsRadiusMeters}::${startSig}::${finishSig}::${cpSig}`;
  }, [
    course.id,
    course.enforceOrder,
    course.validationMethod,
    course.defaultGpsRadiusMeters,
    course.startLocation,
    course.finishLocation,
    course.checkpoints,
  ]);

  const courseRef = useRef<Course>(course);
  courseRef.current = course;

  // Inisialisasi Peta Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const defaultCenter: [number, number] = course.startLocation
      ? [course.startLocation.latitude, course.startLocation.longitude]
      : course.checkpoints.length > 0
      ? [course.checkpoints[0].latitude, course.checkpoints[0].longitude]
      : [-6.8586, 107.6305];

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 15,
      zoomControl: true,
    });

    const initialLayerCfg = TILE_LAYERS.STREET;
    const tileLayer = L.tileLayer(initialLayerCfg.url, {
      attribution: initialLayerCfg.attribution,
      maxZoom: initialLayerCfg.maxZoom,
    }).addTo(map);

    const overlayGroup = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      clickHandlerRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;
    tileLayerRef.current = tileLayer;
    overlayGroupRef.current = overlayGroup;

    // Pastikan ukuran peta dirender sempurna
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      overlayGroupRef.current = null;
    };
  }, []);

  // Ganti Tile Layer saat user memilih Street / Satelit / Topografi
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

  // Fungsi fokuskan tampilan peta ke seluruh titik lintasan Course
  const fitMapToCourseBounds = React.useCallback(() => {
    const map = mapInstanceRef.current;
    const activeCourse = courseRef.current;
    if (!map || !activeCourse) return;

    const boundsPoints: L.LatLngExpression[] = [];
    if (activeCourse.startLocation) {
      boundsPoints.push([
        activeCourse.startLocation.latitude,
        activeCourse.startLocation.longitude,
      ]);
    }
    activeCourse.checkpoints.forEach((cp) => {
      boundsPoints.push([cp.latitude, cp.longitude]);
    });
    if (activeCourse.finishLocation) {
      boundsPoints.push([
        activeCourse.finishLocation.latitude,
        activeCourse.finishLocation.longitude,
      ]);
    }

    if (boundsPoints.length >= 2) {
      map.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [42, 42],
        maxZoom: 17,
      });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 16);
    }
  }, []);

  // Otomatis sesuaikan fokus peta ketika berganti Course
  useEffect(() => {
    if (course.id !== lastFittedCourseIdRef.current) {
      lastFittedCourseIdRef.current = course.id;
      setTimeout(() => {
        fitMapToCourseBounds();
      }, 100);
    }
  }, [course.id, fitMapToCourseBounds]);

  const usesGpsRadius = course.validationMethod !== ValidationMethod.QR_ONLY;

  // Render ulang simbol IOF (Start 🔺, CP ⭕ + Radius, Finish ◎, Garis Rute, dan Preview CP 🎯)
  // Dilengkapi fitur Drag & Drop langsung di peta dengan pelindung isDraggingRef agar tidak pernah terlepas saat digeser
  useEffect(() => {
    const group = overlayGroupRef.current;
    if (!group) return;
    // Jangan pernah menghapus layer saat user sedang menahan & menggeser marker
    if (isDraggingRef.current) return;

    const activeCourse = courseRef.current;
    group.clearLayers();

    const sortedCps = [...activeCourse.checkpoints].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );

    const parsedDraftLat = parseFloat(draftCpLat);
    const parsedDraftLng = parseFloat(draftCpLng);
    const hasValidDraftCoords =
      !Number.isNaN(parsedDraftLat) && !Number.isNaN(parsedDraftLng);

    // Menyimpan titik rute secara berurutan agar polyline ikut bergeser mulus saat marker di-drag atau saat di-klik di tempat baru
    const liveStartCoord: [number, number] | null = activeCourse.startLocation
      ? [activeCourse.startLocation.latitude, activeCourse.startLocation.longitude]
      : null;
    const liveCpCoords: Map<string, [number, number]> = new Map(
      sortedCps.map((cp) => {
        if (!readOnly && editingCheckpointId === cp.id && hasValidDraftCoords) {
          return [cp.id, [parsedDraftLat, parsedDraftLng]];
        }
        return [cp.id, [cp.latitude, cp.longitude]];
      })
    );
    const liveFinishCoord: [number, number] | null = activeCourse.finishLocation
      ? [activeCourse.finishLocation.latitude, activeCourse.finishLocation.longitude]
      : null;

    let routePolyline: L.Polyline | null = null;
    const buildCurrentRouteLatLngs = (): L.LatLngExpression[] => {
      const pts: L.LatLngExpression[] = [];
      if (liveStartCoord) pts.push(liveStartCoord);
      sortedCps.forEach((cp) => {
        const c = liveCpCoords.get(cp.id);
        if (c) pts.push(c);
      });
      if (liveFinishCoord) pts.push(liveFinishCoord);
      return pts;
    };

    const initialRouteCoords = buildCurrentRouteLatLngs();
    if (activeCourse.enforceOrder && initialRouteCoords.length >= 2) {
      routePolyline = L.polyline(initialRouteCoords, {
        color: '#d946ef',
        weight: 3,
        opacity: 0.85,
        dashArray: '8 6',
      }).addTo(group);
    }

    const refreshPolyline = () => {
      if (routePolyline) {
        routePolyline.setLatLngs(buildCurrentRouteLatLngs());
      }
    };

    // 1. Titik START (Segitiga 🔺 — Bisa Di-drag Langsung jika tidak Read-Only)
    if (activeCourse.startLocation && liveStartCoord) {
      const startMarker = L.marker(liveStartCoord, {
        icon: createStartTriangleIcon(),
        draggable: !readOnly,
      });
      startMarker.bindTooltip(
        `<strong>🔺 TITIK START</strong><br/>${activeCourse.startLocation.latitude.toFixed(
          5
        )}, ${activeCourse.startLocation.longitude.toFixed(5)}<br/><em>${
          readOnly
            ? 'Mode Pantau (Read-Only) — Posisi dikunci'
            : 'Geser (Drag) simbol ini untuk memindahkan posisi Start'
        }</em>`,
        { direction: 'top', offset: [0, -14] }
      );
      if (!readOnly) {
        startMarker.on('dragstart', () => {
          isDraggingRef.current = true;
        });
        startMarker.on('drag', () => {
          const pos = startMarker.getLatLng();
          liveStartCoord[0] = pos.lat;
          liveStartCoord[1] = pos.lng;
          refreshPolyline();
        });
        startMarker.on('dragend', () => {
          isDraggingRef.current = false;
          const pos = startMarker.getLatLng();
          const roundedLat = Number(pos.lat.toFixed(6));
          const roundedLng = Number(pos.lng.toFixed(6));
          void callbacksRef.current.onUpdateStartLocation({
            latitude: roundedLat,
            longitude: roundedLng,
            name: activeCourse.startLocation?.name || 'Titik Start',
          });
          setDragFinishedTick((t) => t + 1);
        });
      }
      startMarker.addTo(group);
    }

    // 2. Titik CHECKPOINTS (Lingkaran Tunggal ⭕ + Lingkaran Radius GPS — Bisa Di-drag jika tidak Read-Only)
    sortedCps.forEach((cp) => {
      const isEditingThis = !readOnly && editingCheckpointId === cp.id;
      const effectiveLat =
        isEditingThis && hasValidDraftCoords ? parsedDraftLat : cp.latitude;
      const effectiveLng =
        isEditingThis && hasValidDraftCoords ? parsedDraftLng : cp.longitude;
      const effectiveRadius =
        isEditingThis && draftCpRadiusMeters > 0
          ? draftCpRadiusMeters
          : cp.radiusMeters || activeCourse.defaultGpsRadiusMeters || 35;
      const effectiveCode =
        isEditingThis && draftCpCode.trim()
          ? draftCpCode.trim().toUpperCase()
          : cp.code;
      const cpLatLng: [number, number] = [effectiveLat, effectiveLng];

      let cpCircle: L.Circle | null = null;
      if (usesGpsRadius) {
        cpCircle = L.circle(cpLatLng, {
          radius: effectiveRadius,
          color: isEditingThis ? '#f59e0b' : '#d946ef',
          weight: isEditingThis ? 2 : 1.5,
          fillColor: isEditingThis ? '#f59e0b' : '#d946ef',
          fillOpacity: isEditingThis ? 0.18 : 0.12,
          dashArray: '4 4',
        }).addTo(group);
      }

      const cpForIcon: Checkpoint = isEditingThis
        ? { ...cp, code: effectiveCode }
        : cp;

      const cpMarker = L.marker(cpLatLng, {
        icon: createCheckpointCircleIcon(cpForIcon, isEditingThis),
        draggable: !readOnly,
      });

      const titleStr = cp.name ? `${effectiveCode} — ${cp.name}` : effectiveCode;
      const radiusOrQrInfo = usesGpsRadius
        ? `Radius GPS: ${effectiveRadius}m`
        : 'Validasi: QR Code Saja';

      cpMarker.bindTooltip(
        `<strong>⭕ Pos #${cp.orderIndex}: ${titleStr}</strong><br/>Poin: ${
          cp.points
        } pts • ${radiusOrQrInfo}<br/><em>${
          readOnly
            ? 'Mode Pantau (Read-Only) — Posisi dikunci'
            : isEditingThis
            ? 'Mode Edit Aktif — Klik di peta atau geser simbol ini, lalu klik Simpan Perubahan Pos'
            : 'Klik untuk edit detail • Geser (Drag) untuk pindah posisi langsung'
        }</em>`,
        { direction: 'top', offset: [0, -14] }
      );

      if (!readOnly) {
        cpMarker.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          callbacksRef.current.onSelectCheckpointForEdit(cp);
        });

        cpMarker.on('dragstart', () => {
          isDraggingRef.current = true;
        });

        cpMarker.on('drag', () => {
          const pos = cpMarker.getLatLng();
          if (cpCircle) {
            cpCircle.setLatLng(pos);
          }
          liveCpCoords.set(cp.id, [pos.lat, pos.lng]);
          refreshPolyline();
        });

        cpMarker.on('dragend', () => {
          isDraggingRef.current = false;
          const pos = cpMarker.getLatLng();
          const roundedLat = Number(pos.lat.toFixed(6));
          const roundedLng = Number(pos.lng.toFixed(6));
          if (callbacksRef.current.onDragCheckpointCoordinates) {
            void callbacksRef.current.onDragCheckpointCoordinates(
              cp,
              roundedLat,
              roundedLng
            );
          } else {
            callbacksRef.current.onSelectCheckpointForEdit(cp);
            callbacksRef.current.onPickCpCoordinates(roundedLat, roundedLng);
          }
          setDragFinishedTick((t) => t + 1);
        });
      }

      cpMarker.addTo(group);
    });

    // 3. Titik FINISH (Lingkaran Ganda Konsentris ◎ — Bisa Di-drag jika tidak Read-Only)
    if (activeCourse.finishLocation && liveFinishCoord) {
      const isSameAsStart = Boolean(
        activeCourse.startLocation &&
          Math.abs(
            activeCourse.startLocation.latitude -
              activeCourse.finishLocation.latitude
          ) < 0.00005 &&
          Math.abs(
            activeCourse.startLocation.longitude -
              activeCourse.finishLocation.longitude
          ) < 0.00005
      );

      const finishMarker = L.marker(liveFinishCoord, {
        icon: createFinishDoubleCircleIcon(isSameAsStart),
        draggable: !readOnly,
      });
      finishMarker.bindTooltip(
        `<strong>◎ TITIK FINISH</strong><br/>${activeCourse.finishLocation.latitude.toFixed(
          5
        )}, ${activeCourse.finishLocation.longitude.toFixed(5)}<br/><em>${
          readOnly
            ? 'Mode Pantau (Read-Only) — Posisi dikunci'
            : 'Geser (Drag) simbol ini untuk memindahkan posisi Finish'
        }</em>`,
        { direction: 'top', offset: [0, -14] }
      );
      if (!readOnly) {
        finishMarker.on('dragstart', () => {
          isDraggingRef.current = true;
        });
        finishMarker.on('drag', () => {
          const pos = finishMarker.getLatLng();
          liveFinishCoord[0] = pos.lat;
          liveFinishCoord[1] = pos.lng;
          refreshPolyline();
        });
        finishMarker.on('dragend', () => {
          isDraggingRef.current = false;
          const pos = finishMarker.getLatLng();
          const roundedLat = Number(pos.lat.toFixed(6));
          const roundedLng = Number(pos.lng.toFixed(6));
          void callbacksRef.current.onUpdateFinishLocation({
            latitude: roundedLat,
            longitude: roundedLng,
            name: activeCourse.finishLocation?.name || 'Titik Finish',
          });
          setDragFinishedTick((t) => t + 1);
        });
      }
      finishMarker.addTo(group);
    }

    // 4. Titik Preview / Calon Pos Baru (Draft CP) saat tambah pos baru (bukan sedang edit pos lama)
    if (!readOnly && !editingCheckpointId && hasValidDraftCoords) {
      const matchesExistingUnedited = activeCourse.checkpoints.some(
        (cp) =>
          Math.abs(cp.latitude - parsedDraftLat) < 0.00001 &&
          Math.abs(cp.longitude - parsedDraftLng) < 0.00001
      );

      if (!matchesExistingUnedited) {
        const draftLatLng: [number, number] = [parsedDraftLat, parsedDraftLng];
        let draftCircle: L.Circle | null = null;
        if (usesGpsRadius) {
          const previewRadius =
            draftCpRadiusMeters > 0
              ? draftCpRadiusMeters
              : activeCourse.defaultGpsRadiusMeters || 35;

          draftCircle = L.circle(draftLatLng, {
            radius: previewRadius,
            color: '#fbbf24',
            weight: 2,
            fillColor: '#fbbf24',
            fillOpacity: 0.16,
            dashArray: '5 4',
          }).addTo(group);
        }

        const draftMarker = L.marker(draftLatLng, {
          icon: createDraftCpIcon(draftCpCode, false),
          draggable: true,
        });
        draftMarker.on('dragstart', () => {
          isDraggingRef.current = true;
        });
        draftMarker.on('drag', () => {
          const pos = draftMarker.getLatLng();
          if (draftCircle) {
            draftCircle.setLatLng(pos);
          }
        });
        draftMarker.on('dragend', () => {
          isDraggingRef.current = false;
          const pos = draftMarker.getLatLng();
          callbacksRef.current.onPickCpCoordinates(
            Number(pos.lat.toFixed(6)),
            Number(pos.lng.toFixed(6))
          );
          setDragFinishedTick((t) => t + 1);
        });
        draftMarker.addTo(group);
      }
    }
  }, [
    courseMapSignature,
    usesGpsRadius,
    draftCpCode,
    draftCpLat,
    draftCpLng,
    draftCpRadiusMeters,
    editingCheckpointId,
    readOnly,
    dragFinishedTick,
  ]);

  // Pencarian Lokasi Peta via OpenStreetMap Nominatim (Tanpa harus ke lapangan)
  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q || !mapInstanceRef.current) return;

    setIsSearching(true);
    setSearchStatus(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
          q
        )}`
      );
      const rawText = await res.text().catch(() => '');
      let data: Array<{
        lat: string;
        lon: string;
        display_name: string;
      }> = [];
      try {
        data = JSON.parse(rawText);
      } catch {
        setSearchStatus(
          'Layanan pencarian lokasi sedang padat. Silakan geser peta secara manual.'
        );
        return;
      }
      if (!Array.isArray(data) || data.length === 0) {
        setSearchStatus('Lokasi tidak ditemukan. Coba kata kunci kota/tempat lain.');
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      mapInstanceRef.current.setView([lat, lng], 16);
      setSearchStatus(`Peta diarahkan ke: ${data[0].display_name.slice(0, 65)}...`);
    } catch {
      setSearchStatus('Gagal mencari lokasi. Periksa koneksi internet Anda.');
    } finally {
      setIsSearching(false);
    }
  };

  // Arahkan Peta ke Lokasi GPS Panitia Saat Ini (Opsional)
  const handleLocateMe = () => {
    if (!navigator.geolocation || !mapInstanceRef.current) {
      setSearchStatus('Geolocation GPS tidak didukung di browser ini.');
      return;
    }
    setSearchStatus('Mencari posisi GPS perangkat Anda...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        mapInstanceRef.current?.setView([lat, lng], 17);
        onPickCpCoordinates(lat, lng);
        setSearchStatus(`GPS ditemukan (${lat}, ${lng}). Koordinat siap digunakan.`);
      },
      () => {
        setSearchStatus('Gagal membaca GPS perangkat. Gunakan pencarian lokasi atau klik langsung di peta.');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  // Tombol cepat: Samakan Lokasi Finish = Lokasi Start
  const handleCopyStartToFinish = async () => {
    if (!course.startLocation) return;
    setIsSavingPoint(true);
    try {
      await onUpdateFinishLocation({
        latitude: course.startLocation.latitude,
        longitude: course.startLocation.longitude,
        name: 'Finish (Sama dengan Start)',
      });
    } finally {
      setIsSavingPoint(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 space-y-3">
      {/* Header & Legenda Standar IOF Orienteering */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
              Peta Interaktif Perancang Lintasan (Point &amp; Click)
            </span>
            {course.enforceOrder ? (
              totalRouteMeters > 0 ? (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
                  Garis Alur Aktif (Wajib Urut) • Jarak Lurus:{' '}
                  {totalRouteMeters >= 1000
                    ? `${(totalRouteMeters / 1000).toFixed(2)} km`
                    : `${totalRouteMeters} m`}
                </span>
              ) : (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
                  Garis Alur Aktif (Wajib Urut)
                </span>
              )
            ) : (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Urutan Bebas (Score-O — Tanpa Garis Alur)
              </span>
            )}
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                usesGpsRadius
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {usesGpsRadius
                ? `Lingkaran Radius GPS: Aktif (${course.validationMethod})`
                : 'Mode QR Saja (Tanpa Lingkaran Radius GPS)'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Klik langsung pada peta untuk menempatkan titik{' '}
            <strong className="text-emerald-300">Start (🔺)</strong>,{' '}
            <strong className="text-fuchsia-300">Checkpoint (⭕)</strong>, dan{' '}
            <strong className="text-sky-300">Finish (◎)</strong> tanpa harus
            datang ke lokasi.
          </p>
        </div>

        {/* Pilihan Layer Peta */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
          <Layers className="w-3.5 h-3.5 text-amber-400 ml-1.5" />
          {(
            [
              { id: 'STREET', label: 'Peta Jalan' },
              { id: 'SATELLITE', label: 'Satelit' },
              { id: 'TOPO', label: 'Topografi' },
            ] as Array<{ id: MapTileStyle; label: string }>
          ).map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => setTileStyle(layer.id)}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                tileStyle === layer.id
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      {/* Baris Kontrol: Mode Klik Peta (CP / Start / Finish) + Pencarian Tempat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
        {/* 3 Tombol Mode Klik Peta (Atau Indikator Mode Pantau Read-Only) */}
        <div className="lg:col-span-7 flex flex-wrap items-center gap-1.5">
          {readOnly ? (
            <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
              <span className="font-semibold text-sky-300">
                Mode Pantau Peta (Read-Only):
              </span>
              <span className="text-slate-400">
                Titik Start, Pos CP, dan Finish dikunci agar tidak tergeser tanpa sengaja.
              </span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setClickMode('CP')}
                className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition ${
                  clickMode === 'CP'
                    ? 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <span>⭕</span>
                <span>
                  {editingCheckpointId
                    ? 'Klik Peta = Geser Pos (Edit)'
                    : 'Klik Peta = Titik Pos (CP)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setClickMode('START')}
                className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition ${
                  clickMode === 'START'
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <span>🔺</span>
                <span>Klik Peta = Set Start</span>
              </button>

              <button
                type="button"
                onClick={() => setClickMode('FINISH')}
                className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition ${
                  clickMode === 'FINISH'
                    ? 'bg-sky-500/20 text-sky-200 border-sky-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <span>◎</span>
                <span>Klik Peta = Set Finish</span>
              </button>

              {course.startLocation && (
                <button
                  type="button"
                  disabled={isSavingPoint}
                  onClick={handleCopyStartToFinish}
                  className="px-2.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 text-[11px] font-semibold transition"
                  title="Jadikan titik Finish sama dengan titik Start (Basecamp)"
                >
                  Finish = Start
                </button>
              )}
            </>
          )}
        </div>

        {/* Pencarian Nama Lokasi & Tombol Bantu */}
        <form
          onSubmit={handleSearchLocation}
          className="lg:col-span-5 flex items-center gap-1.5"
        >
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari lokasi (misal: Tahura Bandung, Monas, Bogor)..."
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold transition"
          >
            {isSearching ? '...' : 'Cari'}
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={handleLocateMe}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 transition"
              title="Arahkan ke Lokasi GPS Saya"
            >
              <Compass className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={fitMapToCourseBounds}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition"
            title="Fokuskan ke Seluruh Titik Course"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        </form>
      </div>

      {searchStatus && (
        <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5 flex items-center justify-between">
          <span>{searchStatus}</span>
          <button
            type="button"
            onClick={() => setSearchStatus(null)}
            className="underline ml-2"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Kanvas Peta Interaktif */}
      <div className="relative rounded-xl overflow-hidden border border-slate-700 shadow-inner">
        <div
          ref={mapContainerRef}
          className={`h-[390px] sm:h-[440px] w-full bg-slate-900 z-0 ${
            readOnly ? 'cursor-grab' : 'cursor-crosshair'
          }`}
        />

        {/* Banner Mode Klik & Drag Aktif di Sudut Atas Peta */}
        <div className="pointer-events-none absolute top-3 right-3 left-3 sm:left-auto z-[400] rounded-lg bg-slate-950/90 border border-slate-700 px-3 py-1.5 text-[11px] text-slate-200 shadow-lg backdrop-blur-sm">
          {readOnly ? (
            <span>
              Status Peta:{' '}
              <strong className="text-sky-300">
                Mode Pantau (Read-Only) • Klik &amp; Geser Titik Pos Dikunci
              </strong>
            </span>
          ) : clickMode === 'CP' ? (
            <span>
              Mode Aktif:{' '}
              <strong className="text-fuchsia-300">
                ⭕ Klik peta untuk tambah ({draftCpCode || 'CP'}) • Geser (Drag) simbol 🔺/⭕/◎ untuk pindah posisi
              </strong>
            </span>
          ) : clickMode === 'START' ? (
            <span>
              Mode Aktif:{' '}
              <strong className="text-emerald-300">
                🔺 Klik atau Geser (Drag) untuk menempatkan Segitiga START
              </strong>
            </span>
          ) : (
            <span>
              Mode Aktif:{' '}
              <strong className="text-sky-300">
                ◎ Klik atau Geser (Drag) untuk menempatkan Lingkaran Ganda FINISH
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Ringkasan Titik Start, Jumlah CP, dan Titik Finish */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🔺</span>
            <div>
              <div className="font-bold text-emerald-300">
                Titik START (Segitiga)
              </div>
              <div className="font-mono text-[11px] text-slate-300 tabular-nums">
                {course.startLocation
                  ? `${course.startLocation.latitude.toFixed(
                      5
                    )}, ${course.startLocation.longitude.toFixed(5)}`
                  : 'Belum ditentukan'}
              </div>
            </div>
          </div>
          {!readOnly && course.startLocation && (
            <button
              type="button"
              onClick={() => onUpdateStartLocation(null)}
              className="text-[11px] text-slate-400 hover:text-rose-400"
              title="Reset Titik Start"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-fuchsia-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">⭕</span>
            <div>
              <div className="font-bold text-fuchsia-300">
                Pos Kontrol / Checkpoints
              </div>
              <div className="font-mono text-[11px] text-slate-300 tabular-nums">
                {course.checkpoints.length} Pos Terdaftar
                {!readOnly && (
                  <>
                    {' '}• Calon Pos:{' '}
                    {draftCpLat && draftCpLng
                      ? `${Number(draftCpLat).toFixed(4)}, ${Number(
                          draftCpLng
                        ).toFixed(4)}`
                      : '-'}
                  </>
                )}
              </div>
            </div>
          </div>
          <MapPin className="w-4 h-4 text-fuchsia-400 shrink-0" />
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-sky-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">◎</span>
            <div>
              <div className="font-bold text-sky-300">
                Titik FINISH (Lingkaran Ganda)
              </div>
              <div className="font-mono text-[11px] text-slate-300 tabular-nums">
                {course.finishLocation
                  ? `${course.finishLocation.latitude.toFixed(
                      5
                    )}, ${course.finishLocation.longitude.toFixed(5)}`
                  : 'Belum ditentukan'}
              </div>
            </div>
          </div>
          {!readOnly && course.finishLocation ? (
            <button
              type="button"
              onClick={() => onUpdateFinishLocation(null)}
              className="text-[11px] text-slate-400 hover:text-rose-400"
              title="Reset Titik Finish"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Navigation className="w-4 h-4 text-sky-400 shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}
