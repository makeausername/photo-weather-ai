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
  Textarea,
} from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type { AdminLocation, AdminPhotoSpot } from "../admin-api";
import { viewDirectionLabels, type ViewDirectionCode } from "../enum-labels";

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

type PhotoSpotFeatureField =
  | "bestForSunrise"
  | "bestForSunset"
  | "bestForCloudSea"
  | "bestForStars"
  | "bestForMilkyWay"
  | "bestForSnow";

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

const featureFields: readonly [PhotoSpotFeatureField, string][] = [
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

function statusClass(status: string): string {
  if (status.includes("失败") || status.includes("错误") || status.includes("Error")) {
    return "border-danger bg-card text-danger";
  }

  if (status.includes("保存") || status.includes("加载") || status.includes("删除")) {
    return "border-primary bg-secondary text-secondary-foreground";
  }

  return "border-border bg-muted text-muted-foreground";
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
    try {
      const response = await adminApiFetch<LocationsResponse>("/admin/locations");
      setLocations(response.locations);
      setForm((current) => ({
        ...current,
        locationId: current.locationId || response.locations[0]?.id || "",
      }));
    } catch (error) {
      setStatus((error as Error).message);
    }
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
      await adminApiFetch<unknown>(`/admin/photo-spots/${spot.id}`, { method: "DELETE" });
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
    <div className="grid gap-6">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link
          href="/admin/locations"
          className="whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary hover:text-primary"
        >
          地点管理
        </Link>
        <Link
          href="/admin/photo-spots"
          className="whitespace-nowrap rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          机位管理
        </Link>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold">摄影机位</h2>
            <p className="mt-1 text-sm text-muted-foreground">管理具体拍摄点、朝向、适拍类型和安全备注。</p>
          </div>
          <span className={`rounded-lg border px-3 py-2 text-sm ${statusClass(status)}`}>
            {status}
          </span>
        </div>
        <div className="grid gap-3 border-b border-border p-5 md:grid-cols-[220px_minmax(0,1fr)_auto_auto]">
          <Select
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
          </Select>
          <Input
            value={search}
            placeholder="搜索机位名称、标识或说明"
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button onClick={() => void loadPhotoSpots()}>搜索</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              setLocationFilter("");
              void loadPhotoSpots("", "");
            }}
          >
            重置
          </Button>
        </div>

        {photoSpots.length > 0 ? (
          <Table aria-label="机位列表">
            <thead className="bg-muted text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">机位</th>
                <th className="px-4 py-3">地点</th>
                <th className="px-4 py-3">坐标与海拔</th>
                <th className="px-4 py-3">适拍</th>
                <th className="px-4 py-3">说明</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {photoSpots.map((spot) => (
                <tr key={spot.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{spot.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{spot.slug}</div>
                    <Badge variant="muted" className="mt-2">
                      {viewDirectionLabels[spot.viewDirection as ViewDirectionCode] ?? "未标注"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-card-foreground">
                    {spot.location?.name ?? spot.locationId}
                  </td>
                  <td className="px-4 py-3 text-xs leading-6 text-muted-foreground">
                    <div>GCJ-02：{formatCoordinate(spot.latitudeGcj02, spot.longitudeGcj02)}</div>
                    <div>WGS84：{formatCoordinate(spot.latitudeWgs84, spot.longitudeWgs84)}</div>
                    <div>海拔：{spot.elevation === null ? "未填写" : `${spot.elevation} 米`}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {featureFields
                        .filter(([field]) => spot[field])
                        .map(([, label]) => (
                          <Badge key={label} variant="success">
                            {label}
                          </Badge>
                        ))}
                      {spot.isHot ? <Badge variant="warning">热门</Badge> : null}
                      <Badge variant={spot.isVerified ? "success" : "warning"}>
                        {spot.isVerified ? "已验证" : "未验证"}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs leading-6 text-muted-foreground">
                    <div>交通：{spot.trafficNote ?? "未填写"}</div>
                    <div>安全：{spot.safetyNote ?? "未填写"}</div>
                    <div>风险：{spot.riskNote ?? "未填写"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => startEdit(spot)}>
                        编辑
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(spot)}>
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="暂无机位" description="请先新增一个摄影机位。" />
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">{editingId ? "编辑机位" : "新增机位"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">机位坐标需要同时维护 GCJ-02 和 WGS84。</p>
        </div>
        <form
          className="grid gap-5 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void savePhotoSpot();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="所属地点">
              <Select
                value={form.locationId}
                onChange={(event) => updateForm("locationId", event.target.value)}
              >
                <option value="">请选择地点</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="机位名称">
              <Input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
              />
            </FormField>
            <FormField label="访问标识">
              <Input
                value={form.slug}
                onChange={(event) => updateForm("slug", event.target.value)}
              />
            </FormField>
            <FormField label="朝向">
              <Select
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
            <FormField label="海拔（米）">
              <Input
                inputMode="decimal"
                value={form.elevation}
                onChange={(event) => updateForm("elevation", event.target.value)}
              />
            </FormField>
            <FormField label="机位说明" className="md:col-span-2">
              <Textarea
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
              />
            </FormField>
            <div className="grid gap-3 md:col-span-2 md:grid-cols-2 xl:grid-cols-3">
              {featureFields.map(([field, label]) => (
                <SwitchRow
                  key={field}
                  label={label}
                  checked={form[field]}
                  onChange={(checked) => updateForm(field, checked)}
                />
              ))}
              <SwitchRow
                label="热门机位"
                checked={form.isHot}
                onChange={(checked) => updateForm("isHot", checked)}
              />
              <SwitchRow
                label="已人工核验"
                checked={form.isVerified}
                onChange={(checked) => updateForm("isVerified", checked)}
              />
            </div>
            <FormField label="到达说明">
              <Textarea
                value={form.accessNote}
                onChange={(event) => updateForm("accessNote", event.target.value)}
              />
            </FormField>
            <FormField label="交通说明">
              <Textarea
                value={form.trafficNote}
                onChange={(event) => updateForm("trafficNote", event.target.value)}
              />
            </FormField>
            <FormField label="安全说明">
              <Textarea
                value={form.safetyNote}
                onChange={(event) => updateForm("safetyNote", event.target.value)}
              />
            </FormField>
            <FormField label="风险提示">
              <Textarea
                value={form.riskNote}
                onChange={(event) => updateForm("riskNote", event.target.value)}
              />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={locations.length === 0}>
              保存
            </Button>
            <Button variant="secondary" onClick={resetForm}>
              取消
            </Button>
          </div>
        </form>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除机位"
        description={<>确认删除「{deleteTarget?.name}」？该操作会写入审计日志。</>}
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={() => {
          if (deleteTarget) {
            void deletePhotoSpot(deleteTarget);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
