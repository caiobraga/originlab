import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  adminListPropostas,
  adminListEditais,
  adminListUsers,
  adminListBillingPlans,
  adminUpsertBillingPlan,
  adminPatchUser,
  adminUpdateEdital,
  adminUpdateProposta,
  type AdminUserRow,
  type BillingPlanRow,
  type EditalAdminRow,
  type PropostaAdminRow,
} from "@/lib/adminApi";
import { toast } from "sonner";

type Tab = "propostas" | "editais" | "usuarios" | "pagamentos";

const PROPOSTA_STATUSES: Array<PropostaAdminRow["status"]> = [
  "rascunho",
  "em_redacao",
  "revisao",
  "submetida",
  "aprovada",
  "rejeitada",
];

const statusLabel = (s: PropostaAdminRow["status"]) => {
  switch (s) {
    case "rascunho":
      return "Rascunho";
    case "em_redacao":
      return "Em redação";
    case "revisao":
      return "Revisão";
    case "submetida":
      return "Submetida";
    case "aprovada":
      return "Aprovada";
    case "rejeitada":
      return "Rejeitada";
    default:
      return s;
  }
};

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const [, setLocation] = useLocation();

  const [tab, setTab] = useState<Tab>("propostas");
  const [busy, setBusy] = useState(false);

  const isAdmin = Boolean(profile?.isAdmin);
  const [adminVerified, setAdminVerified] = useState<boolean | null>(null);
  const [adminVerifyError, setAdminVerifyError] = useState<string | null>(null);

  // Gate (login)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLocation("/login?redirect=/admin");
      return;
    }
  }, [authLoading, user, setLocation]);

  // Gate (admin verification)
  useEffect(() => {
    if (!user) return;
    if (authLoading || profileLoading) return;
    if (isAdmin) {
      setAdminVerified(true);
      setAdminVerifyError(null);
      return;
    }
    // Fallback: validar via API admin (server-side, service role).
    setAdminVerified(null);
    setAdminVerifyError(null);
    adminListUsers({ page: 1, perPage: 1 })
      .then(() => {
        setAdminVerified(true);
        setAdminVerifyError(null);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Falha ao validar admin";
        setAdminVerified(false);
        setAdminVerifyError(msg);
      });
  }, [user?.id, authLoading, profileLoading, isAdmin]);

  // Users
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userQuery, setUserQuery] = useState("");

  // Propostas
  const [propostas, setPropostas] = useState<PropostaAdminRow[]>([]);
  const [propostasStatusFiltro, setPropostasStatusFiltro] = useState<string>("");
  const [selectedProposta, setSelectedProposta] = useState<PropostaAdminRow | null>(null);
  const [propostaDialogOpen, setPropostaDialogOpen] = useState(false);
  const [draggingPropostaId, setDraggingPropostaId] = useState<string | null>(null);

  // Editais
  const [editais, setEditais] = useState<EditalAdminRow[]>([]);
  const [editaisQuery, setEditaisQuery] = useState("");
  const [editaisAtivoFiltro, setEditaisAtivoFiltro] = useState<"__all__" | "dashboard" | "1" | "0">("dashboard");
  const [selectedEdital, setSelectedEdital] = useState<EditalAdminRow | null>(null);
  const [editalDialogOpen, setEditalDialogOpen] = useState(false);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.email || "").toLowerCase().includes(q) || u.id.toLowerCase().includes(q));
  }, [users, userQuery]);

  const usersById = useMemo(() => {
    return new Map(users.map((u) => [u.id, u]));
  }, [users]);

  const [planFiltro, setPlanFiltro] = useState<string>("__all__");

  const planOptions = useMemo(() => {
    const plans = new Set<string>();
    let hasNull = false;
    for (const u of users) {
      const p = (u.subscription_plan_key || "").trim().toLowerCase();
      if (!p) hasNull = true;
      else plans.add(p);
    }
    const sorted = [...plans].sort((a, b) => a.localeCompare(b));
    return {
      hasNull,
      plans: sorted,
    };
  }, [users]);

  async function loadUsers() {
    setBusy(true);
    try {
      const data = await adminListUsers({ page: 1, perPage: 100 });
      setUsers(data.users);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar usuários");
    } finally {
      setBusy(false);
    }
  }

  async function loadBillingPlans() {
    setBusy(true);
    try {
      const data = await adminListBillingPlans();
      setBillingPlans(data.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar planos");
    } finally {
      setBusy(false);
    }
  }

  async function loadPropostas() {
    setBusy(true);
    try {
      const data = await adminListPropostas({
        limit: 100,
        offset: 0,
        status: propostasStatusFiltro || undefined,
      });
      setPropostas(data.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar propostas");
    } finally {
      setBusy(false);
    }
  }

  async function loadEditais() {
    setBusy(true);
    try {
      const data = await adminListEditais({
        limit: 100,
        offset: 0,
        q: editaisQuery || undefined,
        ativo: editaisAtivoFiltro === "__all__" ? undefined : editaisAtivoFiltro,
      });
      setEditais(data.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar editais");
    } finally {
      setBusy(false);
    }
  }

  // Recarregar editais automaticamente ao mudar filtros/busca (evita “parece não funcionar”).
  useEffect(() => {
    if (!user || adminVerified !== true) return;
    if (tab !== "editais") return;
    const t = window.setTimeout(() => {
      void loadEditais();
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, editaisAtivoFiltro, editaisQuery, user?.id, adminVerified]);

  async function movePropostaStatus(propostaId: string, nextStatus: PropostaAdminRow["status"]) {
    const current = propostas.find((p) => p.id === propostaId);
    if (!current) return;
    if (current.status === nextStatus) return;
    if (busy) return;

    // Optimistic update
    setPropostas((prev) => prev.map((p) => (p.id === propostaId ? { ...p, status: nextStatus } : p)));
    try {
      setBusy(true);
      await adminUpdateProposta(propostaId, { status: nextStatus });
      toast.success(`Status atualizado: ${statusLabel(nextStatus)}`);
      await loadPropostas();
    } catch (e) {
      // rollback
      setPropostas((prev) => prev.map((p) => (p.id === propostaId ? { ...p, status: current.status } : p)));
      toast.error(e instanceof Error ? e.message : "Falha ao mover card");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!user || adminVerified !== true) return;
    void loadPropostas();
    void loadEditais();
    void loadUsers();
    void loadBillingPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, adminVerified]);

  if (authLoading || profileLoading || adminVerified === null) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-10 text-gray-700">
          {authLoading || profileLoading ? "Carregando…" : "Validando acesso admin…"}
        </main>
      </div>
    );
  }

  if (!user) return null;
  if (adminVerified !== true) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-10">
          <Card className="p-6 space-y-3">
            <div className="text-lg font-semibold text-gray-900">Acesso ao admin negado</div>
            <div className="text-sm text-gray-700">
              Seu usuário está logado, mas não foi possível confirmar permissão de administrador.
            </div>
            {adminVerifyError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                {adminVerifyError}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLocation("/dashboard")}>
                Voltar ao dashboard
              </Button>
              <Button
                onClick={() => {
                  // forçar revalidação
                  setAdminVerified(null);
                }}
              >
                Tentar novamente
              </Button>
            </div>
            <div className="text-xs text-gray-600">
              Dica: confirme no Supabase que existe linha em <code>profiles</code> para seu <code>user_id</code> e que
              <code> is_admin = true</code>. Se o <code>profiles</code> estiver com RLS quebrado, o app pode não conseguir
              ler o perfil no client.
            </div>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
            <p className="text-sm text-gray-600">Controle de usuários.</p>
          </div>
          <div className="flex gap-2">
            <Button variant={tab === "propostas" ? "default" : "outline"} onClick={() => setTab("propostas")}>
              Propostas
            </Button>
            <Button variant={tab === "editais" ? "default" : "outline"} onClick={() => setTab("editais")}>
              Editais
            </Button>
            <Button variant={tab === "usuarios" ? "default" : "outline"} onClick={() => setTab("usuarios")}>
              Usuários
            </Button>
            <Button variant={tab === "pagamentos" ? "default" : "outline"} onClick={() => setTab("pagamentos")}>
              Pagamentos
            </Button>
          </div>
        </div>

        {tab === "propostas" && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Filtrar status (rascunho, em_redacao, revisao, submetida, aprovada, rejeitada)"
                  value={propostasStatusFiltro}
                  onChange={(e) => setPropostasStatusFiltro(e.target.value)}
                  className="w-[420px]"
                />
                <Select value={planFiltro} onValueChange={setPlanFiltro}>
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="Plano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os planos</SelectItem>
                    {planOptions.plans.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                    {planOptions.hasNull && <SelectItem value="__none__">Sem plano</SelectItem>}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => void loadPropostas()} disabled={busy}>
                  Atualizar
                </Button>
              </div>
              <div className="text-sm text-gray-600">{propostas.length} proposta(s)</div>
            </div>

            <div className="overflow-auto">
              <div className="min-w-[1000px] grid grid-cols-6 gap-3">
                {PROPOSTA_STATUSES.map((st) => {
                  const col = propostas.filter((p) => {
                    if (p.status !== st) return false;
                    const plan = (usersById.get(p.user_id)?.subscription_plan_key || "").trim().toLowerCase();
                    const pf = planFiltro;
                    if (pf === "__all__") return true;
                    if (pf === "__none__") return !plan;
                    return plan === pf;
                  });
                  return (
                    <div
                      key={st}
                      className="bg-gray-100/70 border rounded-lg p-3"
                      onDragOver={(e) => {
                        // allow drop
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const propostaId = e.dataTransfer.getData("text/proposta-id");
                        if (!propostaId) return;
                        void movePropostaStatus(propostaId, st);
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-gray-900 text-sm">{statusLabel(st)}</div>
                        <Badge variant="outline" className="text-xs">
                          {col.length}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {col.map((p) => {
                          const u = usersById.get(p.user_id);
                          const email = u?.email || null;
                          const planKey = u?.subscription_plan_key || null;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left"
                              draggable={!busy}
                              onDragStart={(e) => {
                                setDraggingPropostaId(p.id);
                                e.dataTransfer.setData("text/proposta-id", p.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDraggingPropostaId(null);
                              }}
                              onClick={() => {
                                setSelectedProposta(p);
                                setPropostaDialogOpen(true);
                              }}
                            >
                              <Card
                                className={[
                                  "p-3 hover:bg-white/70 transition-colors",
                                  draggingPropostaId === p.id ? "opacity-60" : "",
                                ].join(" ")}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500 truncate">
                                      {email ? email : p.user_id}
                                    </div>
                                    <div className="text-sm font-medium text-gray-900 truncate">
                                      Proposta {p.id.slice(0, 8)}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {planKey && (
                                      <Badge variant="secondary" className="text-xs">
                                        {planKey}
                                      </Badge>
                                    )}
                                    {typeof p.progresso === "number" && (
                                      <Badge variant="outline" className="text-xs">
                                        {p.progresso}%
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-2 text-xs text-gray-600 truncate">
                                  Edital: {p.edital_id}
                                </div>
                                <div className="mt-1 text-[11px] text-gray-500">
                                  {p.atualizado_em ? `Atualizado: ${new Date(p.atualizado_em).toLocaleString("pt-BR")}` : "—"}
                                </div>
                              </Card>
                            </button>
                          );
                        })}
                        {col.length === 0 && (
                          <div className="text-xs text-gray-500 py-2">Sem propostas</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {tab === "editais" && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Buscar edital (título, descrição, número, órgão, área)…"
                  value={editaisQuery}
                  onChange={(e) => setEditaisQuery(e.target.value)}
                  className="w-[520px]"
                />
                <Select value={editaisAtivoFiltro} onValueChange={(v) => setEditaisAtivoFiltro(v as any)}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Situação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    <SelectItem value="dashboard">Ativos (dashboard)</SelectItem>
                    <SelectItem value="1">Ativos</SelectItem>
                    <SelectItem value="0">Inativos</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => void loadEditais()} disabled={busy}>
                  Atualizar
                </Button>
              </div>
              <div className="text-sm text-gray-600">{editais.length} edital(is)</div>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-600">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Título</th>
                    <th className="py-2 pr-3">Fonte</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Encerramento</th>
                    <th className="py-2 pr-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {editais.map((e) => (
                    <tr key={e.id} className="border-b">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{e.titulo}</div>
                        <div className="text-xs text-gray-500 break-all">{e.id}</div>
                      </td>
                      <td className="py-2 pr-3">{e.fonte}</td>
                      <td className="py-2 pr-3">{e.status || "-"}</td>
                      <td className="py-2 pr-3">{e.data_encerramento || "-"}</td>
                      <td className="py-2 pr-3 space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedEdital(e);
                            setEditalDialogOpen(true);
                          }}
                        >
                          Ver/editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setLocation(`/edital/${e.id}`)}>
                          Abrir no site
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {editais.length === 0 && (
                    <tr>
                      <td className="py-6 text-gray-600" colSpan={5}>
                        Nada para exibir.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Dialog open={editalDialogOpen} onOpenChange={setEditalDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Editar edital</DialogTitle>
            </DialogHeader>
            {selectedEdital ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Título</div>
                    <Input
                      value={selectedEdital.titulo}
                      onChange={(ev) => setSelectedEdital({ ...selectedEdital, titulo: ev.target.value })}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Status</div>
                    <Input
                      value={selectedEdital.status || ""}
                      onChange={(ev) => setSelectedEdital({ ...selectedEdital, status: ev.target.value || null })}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Data encerramento (YYYY-MM-DD)</div>
                    <Input
                      value={selectedEdital.data_encerramento || ""}
                      onChange={(ev) =>
                        setSelectedEdital({ ...selectedEdital, data_encerramento: ev.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Valor projeto</div>
                    <Input
                      value={selectedEdital.valor_projeto || ""}
                      onChange={(ev) => setSelectedEdital({ ...selectedEdital, valor_projeto: ev.target.value || null })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Prazo inscrição</div>
                    <Input
                      value={selectedEdital.prazo_inscricao || ""}
                      onChange={(ev) =>
                        setSelectedEdital({ ...selectedEdital, prazo_inscricao: ev.target.value || null })
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Link</div>
                    <Input
                      value={selectedEdital.link || ""}
                      onChange={(ev) => setSelectedEdital({ ...selectedEdital, link: ev.target.value || null })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Descrição</div>
                    <Input
                      value={selectedEdital.descricao || ""}
                      onChange={(ev) => setSelectedEdital({ ...selectedEdital, descricao: ev.target.value || null })}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setLocation(`/edital/${selectedEdital.id}`)}>
                    Abrir no site
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await adminUpdateEdital(selectedEdital.id, selectedEdital);
                        toast.success("Edital atualizado");
                        await loadEditais();
                        setEditalDialogOpen(false);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Falha ao atualizar edital");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Salvar
                  </Button>
                </div>
                <div className="text-xs text-gray-500 break-all">id: {selectedEdital.id}</div>
              </div>
            ) : (
              <div className="text-sm text-gray-600">Selecione um edital.</div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={propostaDialogOpen} onOpenChange={setPropostaDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes da proposta</DialogTitle>
            </DialogHeader>
            {selectedProposta ? (
              <div className="space-y-4">
                {(() => {
                  const u = usersById.get(selectedProposta.user_id);
                  return (
                    <Card className="p-4 space-y-2">
                      <div className="font-medium text-gray-900">Cliente</div>
                      <div className="text-sm text-gray-700">
                        <div><span className="text-gray-500">Email:</span> {u?.email || "—"}</div>
                        <div className="text-xs text-gray-500 break-all">
                          <span className="text-gray-500">user_id:</span> {selectedProposta.user_id}
                        </div>
                        <div className="text-sm text-gray-700">
                          <span className="text-gray-500">Plano:</span> {u?.subscription_plan_key || "—"}{" "}
                          <span className="text-gray-500">Status:</span> {u?.subscription_status || "—"}
                        </div>
                        <div className="text-sm text-gray-700">
                          <span className="text-gray-500">CNPJ:</span> {u?.cnpj || "—"}{" "}
                          <span className="text-gray-500">Lattes:</span> {u?.lattes_id || "—"}
                        </div>
                        <div className="text-sm text-gray-700">
                          <span className="text-gray-500">Tipo:</span> {u?.user_type || "—"}{" "}
                          <span className="text-gray-500">Has CNPJ:</span> {String(u?.has_cnpj ?? "—")}
                        </div>
                      </div>
                    </Card>
                  );
                })()}

                <Card className="p-4 space-y-2">
                  <div className="font-medium text-gray-900">Proposta</div>
                  <div className="text-sm text-gray-700 space-y-1">
                    <div className="break-all"><span className="text-gray-500">id:</span> {selectedProposta.id}</div>
                    <div className="break-all"><span className="text-gray-500">edital_id:</span> {selectedProposta.edital_id}</div>
                    <div><span className="text-gray-500">status:</span> {selectedProposta.status}</div>
                    <div><span className="text-gray-500">progresso:</span> {typeof selectedProposta.progresso === "number" ? `${selectedProposta.progresso}%` : "—"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setLocation(`/edital/${selectedProposta.edital_id}`)}>
                      Abrir edital
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setLocation(`/propostas/${selectedProposta.id}`)}>
                      Abrir proposta
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await adminUpdateProposta(selectedProposta.id, { status: "revisao" });
                          await loadPropostas();
                          toast.success("Status atualizado");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Falha");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Marcar como revisão
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await adminUpdateProposta(selectedProposta.id, { status: "aprovada" });
                          await loadPropostas();
                          toast.success("Status atualizado");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Falha");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Aprovar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await adminUpdateProposta(selectedProposta.id, { status: "rejeitada" });
                          await loadPropostas();
                          toast.success("Status atualizado");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Falha");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Rejeitar
                    </Button>
                  </div>
                </Card>
              </div>
            ) : (
              <div className="text-sm text-gray-600">Selecione uma proposta no Kanban.</div>
            )}
          </DialogContent>
        </Dialog>

        {tab === "usuarios" && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Input placeholder="Buscar por email ou id…" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} className="w-[320px]" />
                <Button variant="outline" onClick={() => void loadUsers()} disabled={busy}>
                  Atualizar
                </Button>
              </div>
              <div className="text-sm text-gray-600">{users.length} usuário(s)</div>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-600">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Flags</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Último login</th>
                    <th className="py-2 pr-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{u.email || "(sem email)"}</div>
                        <div className="text-xs text-gray-500">{u.id}</div>
                      </td>
                      <td className="py-2 pr-3 space-x-2">
                        {u.is_admin && <Badge>admin</Badge>}
                        {u.is_blocked ? (
                          <Badge variant="destructive">bloqueado</Badge>
                        ) : (
                          <Badge variant="secondary">ativo</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3">{u.user_type || "-"}</td>
                      <td className="py-2 pr-3">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "-"}</td>
                      <td className="py-2 pr-3 space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            const nextIsAdmin = !u.is_admin;
                            // Optimistic update (não depender do reload, que pode falhar por timeout no Supabase)
                            setUsers((prev) =>
                              prev.map((x) => (x.id === u.id ? { ...x, is_admin: nextIsAdmin } : x)),
                            );
                            try {
                              await adminPatchUser(u.id, { is_admin: nextIsAdmin });
                              toast.success("Atualizado");
                            } catch (e) {
                              // rollback
                              setUsers((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, is_admin: u.is_admin } : x)),
                              );
                              toast.error(e instanceof Error ? e.message : "Falha");
                            } finally {
                              setBusy(false);
                              // Reconcile best-effort (não bloquear UI)
                              void loadUsers();
                            }
                          }}
                        >
                          {u.is_admin ? "Remover admin" : "Tornar admin"}
                        </Button>
                        <Button
                          size="sm"
                          variant={u.is_blocked ? "secondary" : "destructive"}
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            const nextIsBlocked = !u.is_blocked;
                            // Optimistic update (não depender do reload, que pode falhar por timeout no Supabase)
                            setUsers((prev) =>
                              prev.map((x) => (x.id === u.id ? { ...x, is_blocked: nextIsBlocked } : x)),
                            );
                            try {
                              await adminPatchUser(u.id, { is_blocked: nextIsBlocked });
                              toast.success("Atualizado");
                            } catch (e) {
                              // rollback
                              setUsers((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, is_blocked: u.is_blocked } : x)),
                              );
                              toast.error(e instanceof Error ? e.message : "Falha");
                            } finally {
                              setBusy(false);
                              // Reconcile best-effort (não bloquear UI)
                              void loadUsers();
                            }
                          }}
                        >
                          {u.is_blocked ? "Desbloquear" : "Bloquear"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td className="py-6 text-gray-600" colSpan={5}>
                        Nada para exibir.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "pagamentos" && (
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-gray-900">Planos (mensalidades)</div>
                <div className="text-xs text-gray-600">
                  Ao salvar, o servidor cria um novo Price mensal no Stripe e passa a usá-lo no checkout.
                </div>
              </div>
              <Button variant="outline" onClick={() => void loadBillingPlans()} disabled={busy}>
                Atualizar
              </Button>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-600">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Plano</th>
                    <th className="py-2 pr-3">Título</th>
                    <th className="py-2 pr-3">Valor (centavos)</th>
                    <th className="py-2 pr-3">Ativo</th>
                    <th className="py-2 pr-3">Stripe price_id</th>
                    <th className="py-2 pr-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {billingPlans.map((p) => (
                    <tr key={p.plan_key} className="border-b align-top">
                      <td className="py-2 pr-3 font-mono text-xs text-gray-700">{p.plan_key}</td>
                      <td className="py-2 pr-3">
                        <Input
                          value={p.title}
                          onChange={(e) =>
                            setBillingPlans((prev) =>
                              prev.map((x) => (x.plan_key === p.plan_key ? { ...x, title: e.target.value } : x)),
                            )
                          }
                          className="w-[260px]"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          value={String(p.unit_amount_cents ?? "")}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setBillingPlans((prev) =>
                              prev.map((x) =>
                                x.plan_key === p.plan_key
                                  ? { ...x, unit_amount_cents: Number.isFinite(n) ? n : x.unit_amount_cents }
                                  : x,
                              ),
                            );
                          }}
                          className="w-[160px]"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          className="border border-gray-200 rounded-md px-2 py-1"
                          value={p.active ? "1" : "0"}
                          onChange={(e) =>
                            setBillingPlans((prev) =>
                              prev.map((x) => (x.plan_key === p.plan_key ? { ...x, active: e.target.value === "1" } : x)),
                            )
                          }
                        >
                          <option value="1">sim</option>
                          <option value="0">não</option>
                        </select>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-gray-700">{p.stripe_price_id || "-"}</td>
                      <td className="py-2 pr-3">
                        <Button
                          size="sm"
                          variant="attention"
                          disabled={busy || billingSavingKey === p.plan_key}
                          onClick={async () => {
                            setBillingSavingKey(p.plan_key);
                            try {
                              const r = await adminUpsertBillingPlan(p.plan_key, {
                                title: p.title,
                                currency: p.currency || "brl",
                                interval: p.interval || "month",
                                unit_amount_cents: Number(p.unit_amount_cents),
                                active: p.active,
                              });
                              setBillingPlans((prev) => prev.map((x) => (x.plan_key === p.plan_key ? r.row : x)));
                              toast.success("Plano atualizado");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Falha ao salvar");
                            } finally {
                              setBillingSavingKey(null);
                            }
                          }}
                        >
                          Salvar
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {billingPlans.length === 0 && (
                    <tr>
                      <td className="py-6 text-gray-600" colSpan={6}>
                        Nada para exibir.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

      </main>
    </div>
  );
}

