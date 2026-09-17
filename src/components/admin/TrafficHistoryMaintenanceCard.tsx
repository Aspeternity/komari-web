import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRPC2Call } from "@/contexts/RPC2Context";
import { formatBytes } from "@/utils/unitHelper";
import { Button, Callout, Dialog, Flex, Text, TextField } from "@radix-ui/themes";
import { AlertTriangle, ScanSearch, ShieldCheck, Trash2 } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingCard } from "./SettingCard";

const TIB = 1024 ** 4;
const MIN_THRESHOLD_TIB = 64 / 1024;
const PREVIEW_LIMIT = 100;

interface TrafficHistoryOutlier {
  metric_name: string;
  entity_id: string;
  resolution_milli: number;
  bucket_start: string;
  count: number;
  sum: number;
  max_value: number;
}

interface TrafficHistoryMaintenanceReport {
  threshold_bytes: number;
  safe_before: string;
  matching_buckets: number;
  affected_entities: string[];
  preview: TrafficHistoryOutlier[];
  truncated: boolean;
  fingerprint: string;
  deleted_buckets?: number;
  remaining_buckets?: number;
  cleanup_limit: number;
}

function resolutionLabel(milliseconds: number): string {
  if (milliseconds % 3_600_000 === 0) {
    return `${milliseconds / 3_600_000} h`;
  }
  if (milliseconds % 60_000 === 0) {
    return `${milliseconds / 60_000} min`;
  }
  return `${milliseconds} ms`;
}

export function TrafficHistoryMaintenanceCard() {
  const { i18n } = useTranslation();
  const { call } = useRPC2Call();
  const isChinese = (i18n.resolvedLanguage || i18n.language || "")
    .toLowerCase()
    .startsWith("zh");
  const copy = isChinese
    ? {
        title: "历史流量异常修复",
        description:
          "扫描 traffic.up / traffic.down 历史汇总中单次上报异常巨大的数据桶。默认只预览，不会修改数据库；清理前必须再次确认。",
        threshold: "异常阈值",
        thresholdHint: "按单次 Agent 上报的最大流量判断，不按整段汇总流量判断。默认 1 TiB。",
        scan: "扫描异常数据",
        scanning: "正在扫描",
        matches: "异常数据桶",
        entities: "受影响服务器",
        safeBefore: "完全封存边界",
        safeBeforeHint:
          "只扫描已经跨过所有 rollup 粒度封存边界的数据，避免尚在内存中的 5 分钟 / 小时 / 日级父桶把已清理的异常重新写回。",
        none: "未发现超过当前阈值的历史流量异常。",
        preview: "异常预览",
        server: "服务器",
        direction: "方向",
        time: "时间",
        resolution: "粒度",
        maxValue: "单次最大值",
        aggregate: "桶内汇总",
        upload: "上传",
        download: "下载",
        truncated: "预览仅显示前 100 条，实际匹配数量以上方统计为准。",
        cleanup: "清理这些异常桶",
        cleanupDisabled: "匹配数量超过单次安全清理上限，请提高阈值后重新扫描。",
        confirmTitle: "确认清理历史异常流量？",
        confirmDescription:
          "此操作只删除扫描结果中被异常单次值污染的 traffic.up / traffic.down 历史汇总桶，不会修改 net.total 累计计数器。删除后对应时间段可能出现小段历史空缺。",
        cancel: "取消",
        confirm: "确认清理",
        cleaning: "正在清理",
        scanFailed: "扫描失败",
        cleanupFailed: "清理失败",
        cleanupDone: "历史异常流量清理完成",
        deleted: "已删除数据桶",
        remaining: "剩余异常桶",
        invalidThreshold: "阈值必须不少于 0.0625 TiB（64 GiB）。",
        staleHint:
          "清理会再次校验扫描时的边界、匹配数量和完整候选集指纹；任何数据变化都会拒绝执行并要求重新扫描。",
      }
    : {
        title: "Historical traffic anomaly repair",
        description:
          "Scan persisted traffic.up / traffic.down rollups for implausibly large individual reports. Scanning is read-only; deletion always requires a second confirmation.",
        threshold: "Anomaly threshold",
        thresholdHint:
          "Evaluated against the largest individual agent report, not the aggregate bucket sum. Default: 1 TiB.",
        scan: "Scan history",
        scanning: "Scanning",
        matches: "Anomalous buckets",
        entities: "Affected servers",
        safeBefore: "Fully sealed boundary",
        safeBeforeHint:
          "Only history beyond every configured rollup sealing boundary is scanned, so mutable 5-minute/hour/day parent buckets cannot recreate a cleaned anomaly later.",
        none: "No historical traffic anomalies exceed the current threshold.",
        preview: "Anomaly preview",
        server: "Server",
        direction: "Direction",
        time: "Time",
        resolution: "Resolution",
        maxValue: "Largest sample",
        aggregate: "Bucket total",
        upload: "Upload",
        download: "Download",
        truncated:
          "Only the first 100 matches are shown; the summary count is authoritative.",
        cleanup: "Clean anomalous buckets",
        cleanupDisabled:
          "The match count exceeds the per-operation safety limit. Raise the threshold and scan again.",
        confirmTitle: "Clean historical traffic anomalies?",
        confirmDescription:
          "Only contaminated traffic.up / traffic.down rollup buckets from the preview are deleted. net.total cumulative counters are untouched. Small gaps can remain in the affected historical time ranges.",
        cancel: "Cancel",
        confirm: "Confirm cleanup",
        cleaning: "Cleaning",
        scanFailed: "Scan failed",
        cleanupFailed: "Cleanup failed",
        cleanupDone: "Historical traffic cleanup completed",
        deleted: "Deleted buckets",
        remaining: "Remaining anomalies",
        invalidThreshold: "Threshold must be at least 0.0625 TiB (64 GiB).",
        staleHint:
          "Cleanup revalidates the preview boundary, match count, and complete candidate-set fingerprint. Any data change fails closed and requires a new scan.",
      };

  const [thresholdTiB, setThresholdTiB] = React.useState("1");
  const [scanning, setScanning] = React.useState(false);
  const [cleaning, setCleaning] = React.useState(false);
  const [report, setReport] = React.useState<TrafficHistoryMaintenanceReport | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const parseThresholdBytes = React.useCallback((): number | null => {
    const value = Number(thresholdTiB);
    if (!Number.isFinite(value) || value < MIN_THRESHOLD_TIB) {
      return null;
    }
    return value * TIB;
  }, [thresholdTiB]);

  const scan = async () => {
    const thresholdBytes = parseThresholdBytes();
    if (thresholdBytes === null) {
      toast.error(copy.invalidThreshold);
      return;
    }
    setScanning(true);
    try {
      const data = await call<
        { threshold_bytes: number; preview_limit: number },
        TrafficHistoryMaintenanceReport
      >("admin:scanTrafficHistoryAnomalies", {
        threshold_bytes: thresholdBytes,
        preview_limit: PREVIEW_LIMIT,
      });
      setReport(data);
      if (data.matching_buckets === 0) {
        toast.success(copy.none);
      }
    } catch (error) {
      toast.error(copy.scanFailed, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setScanning(false);
    }
  };

  const cleanup = async () => {
    if (!report || report.matching_buckets <= 0 || cleaning) return;
    const thresholdBytes = parseThresholdBytes();
    if (thresholdBytes === null) {
      toast.error(copy.invalidThreshold);
      return;
    }
    setConfirmOpen(false);
    setCleaning(true);
    try {
      const data = await call<
        {
          threshold_bytes: number;
          safe_before: string;
          preview_limit: number;
          expected_matches: number;
          expected_fingerprint: string;
          confirm: boolean;
        },
        TrafficHistoryMaintenanceReport
      >("admin:cleanupTrafficHistoryAnomalies", {
        threshold_bytes: thresholdBytes,
        safe_before: report.safe_before,
        preview_limit: PREVIEW_LIMIT,
        expected_matches: report.matching_buckets,
        expected_fingerprint: report.fingerprint,
        confirm: true,
      });
      setReport(data);
      toast.success(copy.cleanupDone, {
        description: `${copy.deleted}: ${data.deleted_buckets ?? 0}; ${copy.remaining}: ${data.remaining_buckets ?? 0}`,
      });
    } catch (error) {
      toast.error(copy.cleanupFailed, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setCleaning(false);
    }
  };

  const cleanupOverLimit =
    report !== null && report.matching_buckets > report.cleanup_limit;

  return (
    <SettingCard
      title={
        <Flex align="center" gap="2">
          <ShieldCheck size={16} />
          {copy.title}
        </Flex>
      }
      description={copy.description}
      direction="column"
      className="km-setting-card km-traffic-history-maintenance-card"
    >
      <Flex direction="column" gap="3" className="w-full pt-3">
        <Flex gap="3" align="end" wrap="wrap">
          <label className="min-w-56 flex-1">
            <Text as="div" size="2" weight="medium" mb="1">
              {copy.threshold}
            </Text>
            <TextField.Root
              type="number"
              min={String(MIN_THRESHOLD_TIB)}
              step="0.25"
              value={thresholdTiB}
              disabled={scanning || cleaning}
              onChange={(event) => {
                setThresholdTiB(event.target.value);
                setReport(null);
              }}
            >
              <TextField.Slot side="right">TiB</TextField.Slot>
            </TextField.Root>
          </label>
          <Button disabled={scanning || cleaning} onClick={() => void scan()}>
            <ScanSearch
              size={16}
              className={scanning ? "animate-pulse" : undefined}
            />
            {scanning ? copy.scanning : copy.scan}
          </Button>
        </Flex>

        <Text size="1" color="gray">
          {copy.thresholdHint}
        </Text>

        {report ? (
          <Flex direction="column" gap="3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-[var(--gray-a5)] p-3">
                <Text as="div" size="1" color="gray">
                  {copy.matches}
                </Text>
                <Text as="div" size="4" weight="bold">
                  {report.matching_buckets}
                </Text>
              </div>
              <div className="rounded-md border border-[var(--gray-a5)] p-3">
                <Text as="div" size="1" color="gray">
                  {copy.entities}
                </Text>
                <Text as="div" size="4" weight="bold">
                  {report.affected_entities.length}
                </Text>
              </div>
              <div className="rounded-md border border-[var(--gray-a5)] p-3">
                <Text as="div" size="1" color="gray">
                  {copy.safeBefore}
                </Text>
                <Text as="div" size="2" weight="medium">
                  {new Date(report.safe_before).toLocaleString()}
                </Text>
              </div>
            </div>

            <Text size="1" color="gray">
              {copy.safeBeforeHint}
            </Text>

            {report.deleted_buckets !== undefined ? (
              <Callout.Root
                color={report.remaining_buckets === 0 ? "green" : "amber"}
                variant="surface"
              >
                <Callout.Icon>
                  <ShieldCheck size={16} />
                </Callout.Icon>
                <Callout.Text>
                  {copy.deleted}: {report.deleted_buckets}; {copy.remaining}:{" "}
                  {report.remaining_buckets ?? 0}
                </Callout.Text>
              </Callout.Root>
            ) : null}

            {report.matching_buckets === 0 ? (
              <Callout.Root color="green" variant="surface">
                <Callout.Icon>
                  <ShieldCheck size={16} />
                </Callout.Icon>
                <Callout.Text>{copy.none}</Callout.Text>
              </Callout.Root>
            ) : (
              <>
                <Text size="2" weight="medium">
                  {copy.preview}
                </Text>
                <div className="overflow-x-auto rounded-lg border border-[var(--gray-a5)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{copy.server}</TableHead>
                        <TableHead>{copy.direction}</TableHead>
                        <TableHead>{copy.time}</TableHead>
                        <TableHead>{copy.resolution}</TableHead>
                        <TableHead>{copy.maxValue}</TableHead>
                        <TableHead>{copy.aggregate}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.preview.map((item, index) => (
                        <TableRow
                          key={`${item.metric_name}-${item.entity_id}-${item.bucket_start}-${item.resolution_milli}-${index}`}
                        >
                          <TableCell className="whitespace-nowrap">
                            {item.entity_id}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {item.metric_name === "traffic.up"
                              ? copy.upload
                              : copy.download}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {new Date(item.bucket_start).toLocaleString()}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {resolutionLabel(item.resolution_milli)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-medium">
                            {formatBytes(item.max_value)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatBytes(item.sum)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {report.truncated ? (
                  <Text size="1" color="gray">
                    {copy.truncated}
                  </Text>
                ) : null}

                <Callout.Root color="amber" variant="surface">
                  <Callout.Icon>
                    <AlertTriangle size={16} />
                  </Callout.Icon>
                  <Callout.Text>
                    {cleanupOverLimit ? copy.cleanupDisabled : copy.staleHint}
                  </Callout.Text>
                </Callout.Root>

                <Flex justify="end">
                  <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <Dialog.Trigger>
                      <Button
                        color="red"
                        disabled={
                          cleaning ||
                          cleanupOverLimit ||
                          report.deleted_buckets !== undefined
                        }
                      >
                        <Trash2 size={16} />
                        {cleaning ? copy.cleaning : copy.cleanup}
                      </Button>
                    </Dialog.Trigger>
                    <Dialog.Content maxWidth="560px">
                      <Dialog.Title>{copy.confirmTitle}</Dialog.Title>
                      <Dialog.Description size="2">
                        {copy.confirmDescription}
                      </Dialog.Description>
                      <Flex direction="column" gap="2" mt="3">
                        <Text size="2">
                          {copy.matches}: <strong>{report.matching_buckets}</strong>
                        </Text>
                        <Text size="2">
                          {copy.entities}:{" "}
                          <strong>{report.affected_entities.length}</strong>
                        </Text>
                        <Text size="2">
                          {copy.threshold}:{" "}
                          <strong>{formatBytes(report.threshold_bytes)}</strong>
                        </Text>
                      </Flex>
                      <Flex gap="3" mt="4" justify="end">
                        <Dialog.Close>
                          <Button variant="soft" color="gray">
                            {copy.cancel}
                          </Button>
                        </Dialog.Close>
                        <Button color="red" onClick={() => void cleanup()}>
                          <Trash2 size={16} />
                          {copy.confirm}
                        </Button>
                      </Flex>
                    </Dialog.Content>
                  </Dialog.Root>
                </Flex>
              </>
            )}
          </Flex>
        ) : null}
      </Flex>
    </SettingCard>
  );
}
