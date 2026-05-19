"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  locationSourceLabels,
  locationTypeLabels,
  type LocationSourceCode,
  type LocationTypeCode,
} from "../enum-labels";
import { adminApiFetch } from "../admin-api";
import type { AdminLocation } from "../admin-api";

type LocationsResponse = {
  readonly locations: AdminLocation[];
};

type LocationFormState = {
  readonly name: string;
  readonly slug: string;
  readonly province: string;
  readonly city: string;
  readonly district: string;
  readonly address: string;
  readonly latitudeGcj02: string;
  readonly longitudeGcj02: string;
  readonly latitudeWgs84: string;
  readonly longitudeWgs84: string;
  readonly elevation: string;
  readonly locationType: LocationTypeCode;
  readonly source: LocationSourceCode;
  readonly isVerified: boolean;
};

const emptyLocationForm: LocationFormState = {
  name: "",
  slug: "",
  province: "",
  city: "",
  district: "",
  address: "",
  latitudeGcj02: "",
  longitudeGcj02: "",
  latitudeWgs84: "",
  longitudeWgs84: "",
  elevation: "",
  locationType: "scenic_area",
  source: "manual",
  isVerified: false,
};

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

function locationToForm(location: AdminLocation): LocationFormState {
  return {
    name: location.name,
    slug: location.slug,
    province: location.province,
    city: location.city,
    district: location.district ?? "",
    address: location.address ?? "",
    latitudeGcj02: String(location.latitudeGcj02),
    longitudeGcj02: String(location.longitudeGcj02),
    latitudeWgs84: String(location.latitudeWgs84),
    longitudeWgs84: String(location.longitudeWgs84),
    elevation: location.elevation === null ? "" : String(location.elevation),
    locationType: location.locationType as LocationTypeCode,
    source: location.source as LocationSourceCode,
    isVerified: location.isVerified,
  };
}

function locationPayloadFromForm(form: LocationFormState) {
  return {
    name: form.name.trim(),
    slug: form.slug.trim(),
    province: form.province.trim(),
    city: form.city.trim(),
    district: optionalText(form.district),
    address: optionalText(form.address),
    latitudeGcj02: requiredNumber("GCJ-02 纬度", form.latitudeGcj02),
    longitudeGcj02: requiredNumber("GCJ-02 经度", form.longitudeGcj02),
    latitudeWgs84: requiredNumber("WGS84 纬度", form.latitudeWgs84),
    longitudeWgs84: requiredNumber("WGS84 经度", form.longitudeWgs84),
    elevation: optionalNumber("海拔", form.elevation),
    locationType: form.locationType,
    source: form.source,
    isVerified: form.isVerified,
  };
}

export function AdminLocationsClient() {
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<LocationFormState>(emptyLocationForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminLocation | null>(null);
  const [status, setStatus] = useState("正在加载地点...");

  async function loadLocations(query = search) {
    const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    try {
      const response = await adminApiFetch<LocationsResponse>(`/admin/locations${suffix}`);
      setLocations(response.locations);
      setStatus(response.locations.length > 0 ? "地点列表已加载。" : "暂无地点。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  useEffect(() => {
    void loadLocations("");
  }, []);

  function updateForm<K extends keyof LocationFormState>(key: K, value: LocationFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function startEdit(location: AdminLocation) {
    setEditingId(location.id);
    setForm(locationToForm(location));
    setStatus(`正在编辑：${location.name}`);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyLocationForm);
  }

  async function saveLocation() {
    setStatus("正在保存地点...");
    try {
      const payload = locationPayloadFromForm(form);
      const response = await adminApiFetch<{ readonly location: AdminLocation }>(
        editingId ? `/admin/locations/${editingId}` : "/admin/locations",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setLocations((current) => {
        if (editingId) {
          return current.map((location) =>
            location.id === response.location.id ? response.location : location,
          );
        }

        return [response.location, ...current];
      });
      resetForm();
      setStatus("地点已保存。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function deleteLocation(location: AdminLocation) {
    setStatus("正在删除地点...");
    try {
      await adminApiFetch(`/admin/locations/${location.id}`, { method: "DELETE" });
      setLocations((current) => current.filter((item) => item.id !== location.id));
      setDeleteTarget(null);
      if (editingId === location.id) {
        resetForm();
      }
      setStatus("地点已删除。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  return (
    <div className="adminStack">
      <div className="adminTabs">
        <Link href="/admin/locations" className="active">
          地点
        </Link>
        <Link href="/admin/photo-spots">摄影机位</Link>
      </div>

      <section className="adminSection">
        <div className="adminSectionHeader">
          <h2>地点资料</h2>
          <span>{status}</span>
        </div>
        <div className="adminToolbar">
          <input
            value={search}
            placeholder="搜索地点、省份、城市或 slug"
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="button" onClick={() => void loadLocations()}>
            搜索
          </button>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => {
              setSearch("");
              void loadLocations("");
            }}
          >
            重置
          </button>
        </div>
        <div className="adminDataTable" role="table" aria-label="地点列表">
          <div className="adminDataRow adminDataHead" role="row">
            <span>地点</span>
            <span>行政区</span>
            <span>GCJ-02</span>
            <span>WGS84</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          {locations.map((location) => (
            <div key={location.id} className="adminDataRow" role="row">
              <span>
                <strong>{location.name}</strong>
                <small>{location.slug}</small>
              </span>
              <span>
                {location.province} / {location.city}
                {location.district ? ` / ${location.district}` : ""}
              </span>
              <span>{formatCoordinate(location.latitudeGcj02, location.longitudeGcj02)}</span>
              <span>{formatCoordinate(location.latitudeWgs84, location.longitudeWgs84)}</span>
              <span>
                <span className="adminPill">
                  {locationTypeLabels[location.locationType as LocationTypeCode] ?? "未知类型"}
                </span>
                <span className="adminPill">
                  {locationSourceLabels[location.source as LocationSourceCode] ?? "未知来源"}
                </span>
                <span className={location.isVerified ? "adminPill success" : "adminPill"}>
                  {location.isVerified ? "已核验" : "待核验"}
                </span>
              </span>
              <span className="rowActions">
                <button type="button" onClick={() => startEdit(location)}>
                  编辑
                </button>
                <button type="button" onClick={() => setDeleteTarget(location)}>
                  删除
                </button>
              </span>
            </div>
          ))}
          {locations.length === 0 ? <div className="adminEmpty">暂无地点，请先新增。</div> : null}
        </div>
      </section>

      <section className="adminSection">
        <div className="adminSectionHeader">
          <h2>{editingId ? "编辑地点" : "新增地点"}</h2>
          <span>地图展示使用 GCJ-02，计算使用 WGS84。</span>
        </div>
        <form
          className="adminForm"
          onSubmit={(event) => {
            event.preventDefault();
            void saveLocation();
          }}
        >
          <div className="adminFormGrid">
            <label className="fieldLabel">
              地点名称
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
              省份
              <input
                value={form.province}
                onChange={(event) => updateForm("province", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              城市
              <input
                value={form.city}
                onChange={(event) => updateForm("city", event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              区县
              <input
                value={form.district}
                onChange={(event) => updateForm("district", event.target.value)}
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
            <label className="fieldLabel">
              地点类型
              <select
                value={form.locationType}
                onChange={(event) =>
                  updateForm("locationType", event.target.value as LocationTypeCode)
                }
              >
                {Object.entries(locationTypeLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldLabel">
              来源
              <select
                value={form.source}
                onChange={(event) => updateForm("source", event.target.value as LocationSourceCode)}
              >
                {Object.entries(locationSourceLabels).map(([code, label]) => (
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
            <label className="fieldLabel wideField">
              详细地址
              <input
                value={form.address}
                onChange={(event) => updateForm("address", event.target.value)}
              />
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
          <div className="adminActions">
            <button type="submit">保存</button>
            <button type="button" className="secondaryButton" onClick={resetForm}>
              取消
            </button>
          </div>
        </form>
      </section>

      {deleteTarget ? (
        <div className="adminDialogBackdrop" role="presentation">
          <div className="adminDialog" role="dialog" aria-modal="true" aria-label="删除地点确认">
            <h2>删除地点</h2>
            <p>确认删除“{deleteTarget.name}”？该地点下的机位也会一起删除。</p>
            <div className="adminActions">
              <button type="button" onClick={() => void deleteLocation(deleteTarget)}>
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
