"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { viewDirectionLabels, type ViewDirectionCode } from "../enum-labels";
import { adminApiFetch } from "../admin-api";
import type { AdminLocation, AdminPhotoSpot } from "../admin-api";

type LocationsResponse = {
  readonly locations: AdminLocation[];
};

type PhotoSpotsResponse = {
  readonly photoSpots: AdminPhotoSpot[];
};

type PhotoSpotFormState = {
  readonly locationId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly latitudeGcj02: string;
  readonly longitudeGcj02: string;
  readonly latitudeWgs84: string;
  readonly longitudeWgs84: string;
  readonly elevation: string;
  readonly viewDirection: ViewDirectionCode;
  readonly bestForSunrise: boolean;
  readonly bestForSunset: boolean;
  readonly bestForCloudSea: boolean;
  readonly bestForStars: boolean;
  readonly bestForMilkyWay: boolean;
  readonly bestForSnow: boolean;
  readonly accessNote: string;
  readonly trafficNote: string;
  readonly safetyNote: string;
  readonly riskNote: string;
  readonly isHot: boolean;
  readonly isVerified: boolean;
};

const emptyPhotoSpotForm: PhotoSpotFormState = {
  locationId: "",
  name: "",
  slug: "",
  description: "",
  latitudeGcj02: "",
  longitudeGcj02: "",
  latitudeWgs84: "",
  longitudeWgs84: "",
  elevation: "",
  viewDirection: "unknown",
  bestForSunrise: false,
  bestForSunset: false,
  bestForCloudSea: false,
  bestForStars: false,
  bestForMilkyWay: false,
  bestForSnow: false,
  accessNote: "",
  trafficNote: "",
  safetyNote: "",
  riskNote: "",
  isHot: false,
  isVerified: false,
};

const featureFields = [
  ["bestForSunrise", "适合日出"],
  ["bestForSunset", "适合日落"],
  ["bestForCloudSea", "适合云海"],
  ["bestForStars", "适合星空"],
  ["bestForMilkyWay", "适合银河"],
  ["bestForSnow", "适合雪景"],
] as const;

function formatCoordinate(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requiredNumber(fieldName: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName}必须是有效数字。`);
  }

  return parsed;
}

function optionalNumber(fieldName: string, value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  return requiredNumber(fieldName, value);
}

function spotToForm(spot: AdminPhotoSpot): PhotoSpotFormState {
  return {
    locationId: spot.locationId,
    name: spot.name,
    slug: spot.slug,
    description: spot.description ?? "",
    latitudeGcj02: String(spot.latitudeGcj02),
    longitudeGcj02: String(spot.longitudeGcj02),
    latitudeWgs84: String(spot.latitudeWgs84),
    longitudeWgs84: String(spot.longitudeWgs84),
    elevation: spot.elevation === null ? "" : String(spot.elevation),
    viewDirection: spot.viewDirection as ViewDirectionCode,
    bestForSunrise: spot.bestForSunrise,
    bestForSunset: spot.bestForSunset,
    bestForCloudSea: spot.bestForCloudSea,
    bestForStars: spot.bestForStars,
    bestForMilkyWay: spot.bestForMilkyWay,
    bestForSnow: spot.bestForSnow,
    accessNote: spot.accessNote ?? "",
    trafficNote: spot.trafficNote ?? "",
    safetyNote: spot.safetyNote ?? "",
    riskNote: spot.riskNote ?? "",
    isHot: spot.isHot,
    isVerified: spot.isVerified,
  };
}

function spotPayloadFromForm(form: PhotoSpotFormState) {
  return {
    locationId: form.locationId,
    name: form.name.trim(),
    slug: form.slug.trim(),
    description: optionalText(form.description),
    latitudeGcj02: requiredNumber("GCJ-02 纬度", form.latitudeGcj02),
    longitudeGcj02: requiredNumber("GCJ-02 经度", form.longitudeGcj02),
    latitudeWgs84: requiredNumber("WGS84 纬度", form.latitudeWgs84),
    longitudeWgs84: requiredNumber("WGS84 经度", form.longitudeWgs84),
    elevation: optionalNumber("海拔", form.elevation),
    viewDirection: form.viewDirection,
    bestForSunrise: form.bestForSunrise,
    bestForSunset: form.bestForSunset,
    bestForCloudSea: form.bestForCloudSea,
    bestForStars: form.bestForStars,
    bestForMilkyWay: form.bestForMilkyWay,
    bestForSnow: form.bestForSnow,
    accessNote: optionalText(form.accessNote),
    trafficNote: optionalText(form.trafficNote),
    safetyNote: optionalText(form.safetyNote),
    riskNote: optionalText(form.riskNote),
    isHot: form.isHot,
    isVerified: form.isVerified,
  };
}

export function AdminPhotoSpotsClient() {
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [photoSpots, setPhotoSpots] = useState<AdminPhotoSpot[]>([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<PhotoSpotFormState>(emptyPhotoSpotForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPhotoSpot | null>(null);
  const [status, setStatus] = useState("正在加载机位...");

  async function loadLocations() {
    const response = await adminApiFetch<LocationsResponse>("/admin/locations");
    setLocations(response.locations);
    setForm((current) => ({
      ...current,
      locationId: current.locationId || response.locations[0]?.id || "",
    }));
  }

  async function loadPhotoSpots(query = search, nextLocationFilter = locationFilter) {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (nextLocationFilter) {
      params.set("locationId", nextLocationFilter);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";

    try {
      const response = await adminApiFetch<PhotoSpotsResponse>(`/admin/photo-spots${suffix}`);
      setPhotoSpots(response.photoSpots);
      setStatus(response.photoSpots.length > 0 ? "机位列表已加载。" : "暂无机位。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  useEffect(() => {
    void Promise.all([loadLocations(), loadPhotoSpots("", "")]);
  }, []);

  function updateForm<K extends keyof PhotoSpotFormState>(key: K, value: PhotoSpotFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      ...emptyPhotoSpotForm,
      locationId: locationFilter || locations[0]?.id || "",
    });
  }

  function startEdit(spot: AdminPhotoSpot) {
    setEditingId(spot.id);
    setForm(spotToForm(spot));
    setStatus(`正在编辑：${spot.name}`);
  }

  async function savePhotoSpot() {
    setStatus("正在保存机位...");
    try {
      const payload = spotPayloadFromForm(form);
      const response = await adminApiFetch<{ readonly photoSpot: AdminPhotoSpot }>(
        editingId ? `/admin/photo-spots/${editingId}` : "/admin/photo-spots",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );

      setPhotoSpots((current) => {
        if (editingId) {
          return current.map((spot) =>
            spot.id === response.photoSpot.id ? response.photoSpot : spot,
          );
        }

        return [response.photoSpot, ...current];
      });
      resetForm();
      setStatus("机位已保存。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function deletePhotoSpot(spot: AdminPhotoSpot) {
    setStatus("正在删除机位...");
    try {
      await adminApiFetch(`/admin/photo-spots/${spot.id}`, { method: "DELETE" });
      setPhotoSpots((current) => current.filter((item) => item.id !== spot.id));
      setDeleteTarget(null);
      if (editingId === spot.id) {
        resetForm();
      }
      setStatus("机位已删除。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  return (
    <div className="adminStack">
      <div className="adminTabs">
        <Link href="/admin/locations">地点</Link>
        <Link href="/admin/photo-spots" className="active">
          摄影机位
        </Link>
      </div>

      <section className="adminSection">
        <div className="adminSectionHeader">
          <h2>摄影机位</h2>
          <span>{status}</span>
        </div>
        <div className="adminToolbar">
          <select
            value={locationFilter}
            onChange={(event) => {
              setLocationFilter(event.target.value);
              void loadPhotoSpots(search, event.target.value);
            }}
          >
            <option value="">全部地点</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <input
            value={search}
            placeholder="搜索机位名称、slug 或说明"
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="button" onClick={() => void loadPhotoSpots()}>
            搜索
          </button>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => {
              setSearch("");
              setLocationFilter("");
              void loadPhotoSpots("", "");
            }}
          >
            重置
          </button>
        </div>
        <div className="adminDataTable" role="table" aria-label="机位列表">
          <div className="adminDataRow photoSpotRow adminDataHead" role="row">
            <span>机位</span>
            <span>地点</span>
            <span>坐标与海拔</span>
            <span>适拍</span>
            <span>说明</span>
            <span>操作</span>
          </div>
          {photoSpots.map((spot) => (
            <div key={spot.id} className="adminDataRow photoSpotRow" role="row">
              <span>
                <strong>{spot.name}</strong>
                <small>{spot.slug}</small>
                <small>
                  {viewDirectionLabels[spot.viewDirection as ViewDirectionCode] ?? "未标注"}
                </small>
              </span>
              <span>{spot.location?.name ?? spot.locationId}</span>
              <span>
                <small>GCJ-02：{formatCoordinate(spot.latitudeGcj02, spot.longitudeGcj02)}</small>
                <small>WGS84：{formatCoordinate(spot.latitudeWgs84, spot.longitudeWgs84)}</small>
                <small>海拔：{spot.elevation === null ? "未填" : `${spot.elevation} 米`}</small>
              </span>
              <span className="adminPillRow">
                {featureFields
                  .filter(([field]) => spot[field])
                  .map(([, label]) => (
                    <span key={label} className="adminPill success">
                      {label}
                    </span>
                  ))}
                {spot.isHot ? <span className="adminPill success">热门</span> : null}
                <span className={spot.isVerified ? "adminPill success" : "adminPill"}>
                  {spot.isVerified ? "已核验" : "待核验"}
                </span>
              </span>
              <span>
                <small>交通：{spot.trafficNote ?? "未填"}</small>
                <small>安全：{spot.safetyNote ?? "未填"}</small>
                <small>风险：{spot.riskNote ?? "未填"}</small>
              </span>
              <span className="rowActions">
                <button type="button" onClick={() => startEdit(spot)}>
                  编辑
                </button>
                <button type="button" onClick={() => setDeleteTarget(spot)}>
                  删除
                </button>
              </span>
            </div>
          ))}
          {photoSpots.length === 0 ? (
            <div className="adminEmpty">暂无机位，请先新增摄影机位。</div>
          ) : null}
        </div>
      </section>

      <section className="adminSection">
        <div className="adminSectionHeader">
          <h2>{editingId ? "编辑机位" : "新增机位"}</h2>
          <span>机位坐标同样需要同时维护 GCJ-02 和 WGS84。</span>
        </div>
        <form
          className="adminForm"
          onSubmit={(event) => {
            event.preventDefault();
            void savePhotoSpot();
          }}
        >
          <div className="adminFormGrid">
            <label className="fieldLabel">
              所属地点
              <select
                value={form.locationId}
                onChange={(event) => updateForm("locationId", event.target.value)}
              >
                <option value="">请选择地点</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldLabel">
              机位名称
              <input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              slug
              <input
                value={form.slug}
                onChange={(event) => updateForm("slug", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              朝向
              <select
                value={form.viewDirection}
                onChange={(event) =>
                  updateForm("viewDirection", event.target.value as ViewDirectionCode)
                }
              >
                {Object.entries(viewDirectionLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldLabel">
              GCJ-02 纬度
              <input
                inputMode="decimal"
                value={form.latitudeGcj02}
                onChange={(event) => updateForm("latitudeGcj02", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              GCJ-02 经度
              <input
                inputMode="decimal"
                value={form.longitudeGcj02}
                onChange={(event) => updateForm("longitudeGcj02", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              WGS84 纬度
              <input
                inputMode="decimal"
                value={form.latitudeWgs84}
                onChange={(event) => updateForm("latitudeWgs84", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              WGS84 经度
              <input
                inputMode="decimal"
                value={form.longitudeWgs84}
                onChange={(event) => updateForm("longitudeWgs84", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              海拔（米）
              <input
                inputMode="decimal"
                value={form.elevation}
                onChange={(event) => updateForm("elevation", event.target.value)}
              />
            </label>
            <label className="fieldLabel wideField">
              机位说明
              <textarea
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
              />
            </label>
            <div className="checkboxGrid wideField">
              {featureFields.map(([field, label]) => (
                <label key={field} className="toggleRow">
                  <input
                    type="checkbox"
                    checked={form[field]}
                    onChange={(event) => updateForm(field, event.target.checked)}
                  />
                  {label}
                </label>
              ))}
              <label className="toggleRow">
                <input
                  type="checkbox"
                  checked={form.isHot}
                  onChange={(event) => updateForm("isHot", event.target.checked)}
                />
                热门机位
              </label>
              <label className="toggleRow">
                <input
                  type="checkbox"
                  checked={form.isVerified}
                  onChange={(event) => updateForm("isVerified", event.target.checked)}
                />
                已人工核验
              </label>
            </div>
            <label className="fieldLabel">
              到达说明
              <textarea
                value={form.accessNote}
                onChange={(event) => updateForm("accessNote", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              交通说明
              <textarea
                value={form.trafficNote}
                onChange={(event) => updateForm("trafficNote", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              安全说明
              <textarea
                value={form.safetyNote}
                onChange={(event) => updateForm("safetyNote", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              风险提示
              <textarea
                value={form.riskNote}
                onChange={(event) => updateForm("riskNote", event.target.value)}
              />
            </label>
          </div>
          <div className="adminActions">
            <button type="submit" disabled={locations.length === 0}>
              保存
            </button>
            <button type="button" className="secondaryButton" onClick={resetForm}>
              取消
            </button>
          </div>
        </form>
      </section>

      {deleteTarget ? (
        <div className="adminDialogBackdrop" role="presentation">
          <div className="adminDialog" role="dialog" aria-modal="true" aria-label="删除机位确认">
            <h2>删除机位</h2>
            <p>确认删除“{deleteTarget.name}”？该操作会写入审计日志。</p>
            <div className="adminActions">
              <button type="button" onClick={() => void deletePhotoSpot(deleteTarget)}>
                删除
              </button>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
