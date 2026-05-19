"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  Select,
  SwitchRow,
  Table,
} from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type { AdminLocation } from "../admin-api";
import {
  locationSourceLabels,
  locationTypeLabels,
  type LocationSourceCode,
  type LocationTypeCode,
} from "../enum-labels";

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

function statusClass(status: string): string {
  if (status.includes("失败") || status.includes("错误") || status.includes("Error")) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status.includes("保存") || status.includes("加载") || status.includes("删除")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
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
      await adminApiFetch<unknown>(`/admin/locations/${location.id}`, { method: "DELETE" });
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
    <div className="grid gap-6">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link
          href="/admin/locations"
          className="whitespace-nowrap rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-semibold text-white"
        >
          地点管理
        </Link>
        <Link
          href="/admin/photo-spots"
          className="whitespace-nowrap rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-primary hover:text-primary"
        >
          机位管理
        </Link>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold">地点资料</h2>
            <p className="mt-1 text-sm text-muted">管理景区、山地、城市与自定义拍摄地点。</p>
          </div>
          <span className={`rounded-lg border px-3 py-2 text-sm ${statusClass(status)}`}>
            {status}
          </span>
        </div>
        <div className="flex flex-col gap-3 border-b border-border p-5 md:flex-row">
          <Input
            value={search}
            placeholder="搜索地点、省份、城市或 slug"
            onChange={(event) => setSearch(event.target.value)}
            className="md:max-w-md"
          />
          <Button onClick={() => void loadLocations()}>搜索</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              void loadLocations("");
            }}
          >
            重置
          </Button>
        </div>

        {locations.length > 0 ? (
          <Table aria-label="地点列表">
            <thead className="bg-slate-50 text-xs font-semibold text-muted">
              <tr>
                <th className="px-4 py-3">地点</th>
                <th className="px-4 py-3">行政区</th>
                <th className="px-4 py-3">GCJ-02</th>
                <th className="px-4 py-3">WGS84</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {locations.map((location) => (
                <tr key={location.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{location.name}</div>
                    <div className="mt-1 text-xs text-muted">{location.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {location.province} / {location.city}
                    {location.district ? ` / ${location.district}` : ""}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {formatCoordinate(location.latitudeGcj02, location.longitudeGcj02)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {formatCoordinate(location.latitudeWgs84, location.longitudeWgs84)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="muted">
                        {locationTypeLabels[location.locationType as LocationTypeCode] ??
                          "未知类型"}
                      </Badge>
                      <Badge variant="muted">
                        {locationSourceLabels[location.source as LocationSourceCode] ?? "未知来源"}
                      </Badge>
                      <Badge variant={location.isVerified ? "success" : "warning"}>
                        {location.isVerified ? "已核验" : "待核验"}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => startEdit(location)}>
                        编辑
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(location)}>
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="暂无地点" description="请先新增一个拍摄地点。" />
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">{editingId ? "编辑地点" : "新增地点"}</h2>
          <p className="mt-1 text-sm text-muted">
            地图展示使用 GCJ-02，天气、天文和地形计算使用 WGS84。
          </p>
        </div>
        <form
          className="grid gap-5 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void saveLocation();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="地点名称">
              <Input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
              />
            </FormField>
            <FormField label="slug">
              <Input
                value={form.slug}
                onChange={(event) => updateForm("slug", event.target.value)}
              />
            </FormField>
            <FormField label="省份">
              <Input
                value={form.province}
                onChange={(event) => updateForm("province", event.target.value)}
              />
            </FormField>
            <FormField label="城市">
              <Input
                value={form.city}
                onChange={(event) => updateForm("city", event.target.value)}
              />
            </FormField>
            <FormField label="区县">
              <Input
                value={form.district}
                onChange={(event) => updateForm("district", event.target.value)}
              />
            </FormField>
            <FormField label="海拔（米）">
              <Input
                inputMode="decimal"
                value={form.elevation}
                onChange={(event) => updateForm("elevation", event.target.value)}
              />
            </FormField>
            <FormField label="地点类型">
              <Select
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
              </Select>
            </FormField>
            <FormField label="来源">
              <Select
                value={form.source}
                onChange={(event) => updateForm("source", event.target.value as LocationSourceCode)}
              >
                {Object.entries(locationSourceLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="GCJ-02 纬度">
              <Input
                inputMode="decimal"
                value={form.latitudeGcj02}
                onChange={(event) => updateForm("latitudeGcj02", event.target.value)}
              />
            </FormField>
            <FormField label="GCJ-02 经度">
              <Input
                inputMode="decimal"
                value={form.longitudeGcj02}
                onChange={(event) => updateForm("longitudeGcj02", event.target.value)}
              />
            </FormField>
            <FormField label="WGS84 纬度">
              <Input
                inputMode="decimal"
                value={form.latitudeWgs84}
                onChange={(event) => updateForm("latitudeWgs84", event.target.value)}
              />
            </FormField>
            <FormField label="WGS84 经度">
              <Input
                inputMode="decimal"
                value={form.longitudeWgs84}
                onChange={(event) => updateForm("longitudeWgs84", event.target.value)}
              />
            </FormField>
            <FormField label="详细地址" className="md:col-span-2">
              <Input
                value={form.address}
                onChange={(event) => updateForm("address", event.target.value)}
              />
            </FormField>
            <SwitchRow
              label="已人工核验"
              checked={form.isVerified}
              onChange={(checked) => updateForm("isVerified", checked)}
              className="md:col-span-2"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">保存</Button>
            <Button variant="secondary" onClick={resetForm}>
              取消
            </Button>
          </div>
        </form>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除地点"
        description={<>确认删除「{deleteTarget?.name}」？该地点下的机位也会一起删除。</>}
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={() => {
          if (deleteTarget) {
            void deleteLocation(deleteTarget);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
