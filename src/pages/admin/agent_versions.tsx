import React from "react";
import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Select,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRPC2Call } from "@/contexts/RPC2Context";
import { SettingCardLabel } from "@/components/admin/SettingCard";
import Loading from "@/components/loading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AgentNode = {
  uuid: string;
  name?: string;
  version?: string;
  os?: string;
  arch?: string;
  ipv4?: string;
  ipv6?: string;
};

type AgentReleaseStatus = {
  latest_version: string;
  release_url: string;
  published_at: string;
  checked_at: string;
  source: string;
  stale: boolean;
  check_error?: string;
  cache_ttl_seconds: number;
  auto_update_default: boolean;
  auto_update_interval_hours: number;
  remote_upgrade_supported: boolean;
  remote_upgrade_reason?: string;
};

type VersionState = "latest" | "outdated" | "newer" | "snapshot" | "unknown";

function parseStableVersion(input?: string | null): number[] | null {
  const value = String(input ?? "").trim();
  const match = value.match(/^[vV]?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function classifyVersion(current?: string, latest?: string): VersionState {
  const value = String(current ?? "").trim();
  if (!value) return "unknown";
  if (/^snapshot-/i.test(value)) return "snapshot";
  const a = parseStableVersion(value);
  const b = parseStableVersion(latest);
  if (!a || !b) return "unknown";
  for (let i = 0; i < 3; i += 1) {
    if (a[i] < b[i]) return "outdated";
    if (a[i] > b[i]) return "newer";
  }
  return "latest";
}

function statusLabel(state: VersionState): string {
  switch (state) {
    case "latest":
      return "最新";
    case "outdated":
      return "可升级";
    case "newer":
      return "高于稳定版";
    case "snapshot":
      return "Snapshot";
    default:
      return "未知";
  }
}

function statusColor(state: VersionState): "green" | "orange" | "blue" | "purple" | "gray" {
  switch (state) {
    case "latest":
      return "green";
    case "outdated":
      return "orange";
    case "newer":
      return "blue";
    case "snapshot":
      return "purple";
    default:
      return "gray";
  }
}

function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="min-w-[10rem] flex-1">
      <Flex direction="column" gap="1">
        <Text size="1" color="gray">{label}</Text>
        <Text size="5" weight="bold">{value}</Text>
        {hint ? <Text size="1" color="gray">{hint}</Text> : null}
      </Flex>
    </Card>
  );
}

export default function AgentVersionsPage() {
  const { t } = useTranslation();
  const { call } = useRPC2Call();
  const [nodes, setNodes] = React.useState<AgentNode[]>([]);
  const [release, setRelease] = React.useState<AgentReleaseStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | VersionState>("all");

  const load = React.useCallback(async (forceReleaseRefresh = false) => {
    setError(null);
    try {
      const [nodeResponse, releaseStatus] = await Promise.all([
        fetch("/api/admin/client/list", { cache: "no-store", credentials: "same-origin" }),
        call<{ refresh: boolean }, AgentReleaseStatus>("admin:getAgentReleaseStatus", {
          refresh: forceReleaseRefresh,
        }),
      ]);
      if (!nodeResponse.ok) {
        throw new Error(`Failed to load agents (HTTP ${nodeResponse.status})`);
      }
      const nodeList = (await nodeResponse.json()) as AgentNode[];
      setNodes(Array.isArray(nodeList) ? nodeList : []);
      setRelease(releaseStatus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [call]);

  React.useEffect(() => {
    void load(false);
  }, [load]);

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return nodes
      .map((node) => ({
        ...node,
        versionState: classifyVersion(node.version, release?.latest_version),
      }))
      .filter((node) => filter === "all" || node.versionState === filter)
      .filter((node) => {
        if (!needle) return true;
        return [node.name, node.version, node.os, node.arch, node.ipv4, node.ipv6]
          .some((value) => String(value ?? "").toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        if (a.versionState === "outdated" && b.versionState !== "outdated") return -1;
        if (a.versionState !== "outdated" && b.versionState === "outdated") return 1;
        return String(a.name ?? a.uuid).localeCompare(String(b.name ?? b.uuid));
      });
  }, [filter, nodes, query, release?.latest_version]);

  const counts = React.useMemo(() => {
    const result: Record<VersionState, number> = {
      latest: 0,
      outdated: 0,
      newer: 0,
      snapshot: 0,
      unknown: 0,
    };
    for (const node of nodes) {
      result[classifyVersion(node.version, release?.latest_version)] += 1;
    }
    return result;
  }, [nodes, release?.latest_version]);

  if (loading) return <Loading text="" />;

  return (
    <Flex direction="column" gap="4" p="4" className="km-page-admin-agent-versions">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <div>
          <SettingCardLabel>
            {t("admin.agentVersion.title", "Agent 版本管理")}
          </SettingCardLabel>
          <Text as="div" size="2" color="gray" mt="1">
            {t("admin.agentVersion.description", "集中查看所有节点的 Agent 版本，并与官方最新稳定版比较。")}
          </Text>
        </div>
        <Flex gap="2" wrap="wrap">
          {release?.release_url ? (
            <Button variant="soft" onClick={() => window.open(release.release_url, "_blank", "noopener,noreferrer")}>
              <ExternalLink size={16} />
              Release
            </Button>
          ) : null}
          <Button
            variant="soft"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void load(true);
            }}
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : undefined} />
            {refreshing ? "检查中" : "刷新最新版"}
          </Button>
        </Flex>
      </Flex>

      {error ? (
        <Callout.Root color="red" variant="surface">
          <Callout.Icon><AlertTriangle size={16} /></Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}

      {release?.stale ? (
        <Callout.Root color="orange" variant="surface">
          <Callout.Icon><AlertTriangle size={16} /></Callout.Icon>
          <Callout.Text>
            GitHub 最新版本检查失败，当前显示缓存结果。{release.check_error ? ` ${release.check_error}` : ""}
          </Callout.Text>
        </Callout.Root>
      ) : null}

      <Flex gap="3" wrap="wrap">
        <StatCard
          label="官方最新稳定版"
          value={release?.latest_version ? `v${release.latest_version}` : "-"}
          hint={release?.published_at ? new Date(release.published_at).toLocaleString() : undefined}
        />
        <StatCard label="节点总数" value={nodes.length} />
        <StatCard label="已是最新版" value={counts.latest} />
        <StatCard label="可升级" value={counts.outdated} hint={counts.outdated > 0 ? "优先显示在列表顶部" : "全部稳定版节点已同步"} />
        <StatCard label="其他/未知" value={counts.unknown + counts.snapshot + counts.newer} />
      </Flex>

      <Callout.Root color="blue" variant="surface">
        <Callout.Icon><ShieldCheck size={16} /></Callout.Icon>
        <Callout.Text>
          官方 Agent 默认启用自动更新：启动时检查一次，之后每 {release?.auto_update_interval_hours ?? 6} 小时检查一次；
          使用 <code>--disable-auto-update</code> 的节点不会自动升级。当前 Agent 协议没有专用的远程升级 RPC，因此本页暂不通过远程命令强制替换二进制，避免跨系统升级失败或误停 Agent。
        </Callout.Text>
      </Callout.Root>

      <Card>
        <Flex direction="column" gap="3">
          <Flex justify="between" align="center" gap="3" wrap="wrap">
            <Text size="3" weight="bold">版本清单</Text>
            <Flex gap="2" wrap="wrap">
              <TextField.Root
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索节点、版本、系统或 IP"
                style={{ minWidth: "16rem" }}
              >
                <TextField.Slot><Search size={14} /></TextField.Slot>
              </TextField.Root>
              <Select.Root value={filter} onValueChange={(value) => setFilter(value as "all" | VersionState)}>
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="all">全部状态</Select.Item>
                  <Select.Item value="outdated">可升级</Select.Item>
                  <Select.Item value="latest">最新版</Select.Item>
                  <Select.Item value="snapshot">Snapshot</Select.Item>
                  <Select.Item value="newer">高于稳定版</Select.Item>
                  <Select.Item value="unknown">未知</Select.Item>
                </Select.Content>
              </Select.Root>
            </Flex>
          </Flex>

          <div className="overflow-auto rounded-md border border-[var(--gray-a5)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>节点</TableHead>
                  <TableHead>当前 Agent</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>系统 / 架构</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? rows.map((node) => (
                  <TableRow key={node.uuid}>
                    <TableCell>
                      <Flex direction="column" gap="1">
                        <Text weight="medium">{node.name || node.uuid}</Text>
                        <Text size="1" color="gray">{node.uuid}</Text>
                      </Flex>
                    </TableCell>
                    <TableCell>
                      <Text className="font-mono">{node.version || "-"}</Text>
                    </TableCell>
                    <TableCell>
                      <Badge color={statusColor(node.versionState)} variant="soft">
                        {node.versionState === "latest" ? <CheckCircle2 size={12} /> : null}
                        {statusLabel(node.versionState)}
                      </Badge>
                    </TableCell>
                    <TableCell>{[node.os, node.arch].filter(Boolean).join(" / ") || "-"}</TableCell>
                    <TableCell>{node.ipv4 || node.ipv6 || "-"}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      没有符合条件的节点
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Flex>
      </Card>

      <Text size="1" color="gray">
        最新版本来源：{release?.source || "komari-monitor/komari-agent"}。面板缓存最新 Release 30 分钟，手动刷新可绕过缓存。
      </Text>
    </Flex>
  );
}
