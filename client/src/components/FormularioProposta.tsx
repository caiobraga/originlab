import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { type PropostaFormData, FORM_OPTIONS } from "@/lib/propostaFormFields";
import { Plus, Trash2 } from "lucide-react";

interface FormularioPropostaProps {
  data: PropostaFormData;
  onChange: (data: PropostaFormData) => void;
}

export default function FormularioProposta({ data, onChange }: FormularioPropostaProps) {
  const updateField = <K extends keyof PropostaFormData>(
    field: K,
    value: PropostaFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  const updateNestedField = <K extends keyof PropostaFormData>(
    field: K,
    subField: string,
    value: any
  ) => {
    const currentValue = data[field] as any;
    onChange({
      ...data,
      [field]: { ...currentValue, [subField]: value },
    });
  };

  const updateArrayField = <K extends keyof PropostaFormData>(
    field: K,
    index: number,
    value: any
  ) => {
    const currentArray = (data[field] as any[]) || [];
    const newArray = [...currentArray];
    newArray[index] = value;
    onChange({ ...data, [field]: newArray as any });
  };

  const addArrayItem = <K extends keyof PropostaFormData>(field: K, defaultValue: any) => {
    const currentArray = (data[field] as any[]) || [];
    onChange({ ...data, [field]: [...currentArray, defaultValue] as any });
  };

  const removeArrayItem = <K extends keyof PropostaFormData>(field: K, index: number) => {
    const currentArray = (data[field] as any[]) || [];
    onChange({ ...data, [field]: currentArray.filter((_, i) => i !== index) as any });
  };

  return (
    <div className="space-y-8">
      {/* Seção 1: Título e Versão */}
      <section className="bg-white rounded-lg p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">1. Título do Projeto</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="versao">Versão</Label>
            <Input
              id="versao"
              value={data.versao || ""}
              onChange={(e) => updateField("versao", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="titulo_projeto">Título do Projeto</Label>
            <Input
              id="titulo_projeto"
              value={data.titulo_projeto || ""}
              onChange={(e) => updateField("titulo_projeto", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Seção 1.3: Eixos Estratégicos */}
      <section className="bg-white rounded-lg p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          1.3. Selecionar Apenas Um Eixo e o(s) Tema(s) Estratégico(s)
        </h2>
        <div className="space-y-4">
          {Object.entries(FORM_OPTIONS.eixos).map(([eixoKey, eixo]) => (
            <div key={eixoKey} className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Checkbox
                  id={`eixo-${eixoKey}`}
                  checked={data.eixo_estrategico.selecionado === eixoKey}
                  onCheckedChange={(checked) =>
                    updateNestedField(
                      "eixo_estrategico",
                      "selecionado",
                      checked ? (eixoKey as any) : null
                    )
                  }
                />
                <Label htmlFor={`eixo-${eixoKey}`} className="font-semibold text-gray-900">
                  {eixo.nome}
                </Label>
              </div>
              {data.eixo_estrategico.selecionado === eixoKey && (
                <div className="ml-8 space-y-2">
                  {eixo.temas.map((tema) => {
                    const temasKey = `${eixoKey}_temas` as keyof typeof data.eixo_estrategico;
                    const temasArray = data.eixo_estrategico[temasKey] as string[];
                    const isChecked = temasArray?.includes(tema.id) || false;
                    return (
                      <div key={tema.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`tema-${tema.id}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const currentTemas = [...(temasArray || [])];
                            if (checked) {
                              if (!currentTemas.includes(tema.id)) {
                                currentTemas.push(tema.id);
                              }
                            } else {
                              const index = currentTemas.indexOf(tema.id);
                              if (index > -1) {
                                currentTemas.splice(index, 1);
                              }
                            }
                            updateNestedField("eixo_estrategico", temasKey, currentTemas);
                          }}
                        />
                        <Label htmlFor={`tema-${tema.id}`} className="font-normal">
                          {tema.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Checkbox
              id="nao_se_aplica"
              checked={data.eixo_estrategico.selecionado === "nao_se_aplica"}
              onCheckedChange={(checked) =>
                updateNestedField(
                  "eixo_estrategico",
                  "selecionado",
                  checked ? "nao_se_aplica" : null
                )
              }
            />
            <Label htmlFor="nao_se_aplica" className="font-semibold">
              NÃO SE APLICA - Não se associa a nenhum dos eixos estratégicos
            </Label>
          </div>
        </div>
      </section>

      {/* Seção 2: Dados da Instituição Executora */}
      <section className="bg-white rounded-lg p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          2. Dados da Instituição Executora
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="instituicao_nome">Nome</Label>
            <Input
              id="instituicao_nome"
              value={data.instituicao_executora.nome || ""}
              onChange={(e) =>
                updateNestedField("instituicao_executora", "nome", e.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instituicao_sigla">Sigla</Label>
            <Input
              id="instituicao_sigla"
              value={data.instituicao_executora.sigla || ""}
              onChange={(e) =>
                updateNestedField("instituicao_executora", "sigla", e.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instituicao_municipio">Município</Label>
            <Input
              id="instituicao_municipio"
              value={data.instituicao_executora.municipio || ""}
              onChange={(e) =>
                updateNestedField("instituicao_executora", "municipio", e.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instituicao_cnpj">CNPJ</Label>
            <Input
              id="instituicao_cnpj"
              value={data.instituicao_executora.cnpj || ""}
              onChange={(e) =>
                updateNestedField("instituicao_executora", "cnpj", e.target.value)
              }
            />
          </div>
        </div>

        {/* 2.1 Representante Legal */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            2.1. Dados do(a) Representante Legal ou Representante por Delegação
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rep_legal_nome">Nome</Label>
              <Input
                id="rep_legal_nome"
                value={data.representante_legal.nome || ""}
                onChange={(e) =>
                  updateNestedField("representante_legal", "nome", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rep_legal_cargo">Cargo e Ato de Nomeação/Delegação</Label>
              <Input
                id="rep_legal_cargo"
                value={data.representante_legal.cargo_ato_nomeacao || ""}
                onChange={(e) =>
                  updateNestedField("representante_legal", "cargo_ato_nomeacao", e.target.value)
                }
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>E-mails</Label>
              {(data.representante_legal.emails || [""]).map((email, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <Input
                    value={email}
                    onChange={(e) => {
                      const newEmails = [...(data.representante_legal.emails || [])];
                      newEmails[index] = e.target.value;
                      updateNestedField("representante_legal", "emails", newEmails);
                    }}
                    type="email"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeArrayItem("representante_legal" as any, index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newEmails = [...(data.representante_legal.emails || []), ""];
                  updateNestedField("representante_legal", "emails", newEmails);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar E-mail
              </Button>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Telefones</Label>
              {(data.representante_legal.telefones || [""]).map((telefone, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <Input
                    value={telefone}
                    onChange={(e) => {
                      const newTelefones = [...(data.representante_legal.telefones || [])];
                      newTelefones[index] = e.target.value;
                      updateNestedField("representante_legal", "telefones", newTelefones);
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeArrayItem("representante_legal" as any, index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newTelefones = [...(data.representante_legal.telefones || []), ""];
                  updateNestedField("representante_legal", "telefones", newTelefones);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Telefone
              </Button>
            </div>
          </div>
        </div>

        {/* 2.2 Coordenador do Projeto */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            2.2. Dados do(a) Coordenador(a) do Projeto
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="coord_nome">Nome</Label>
              <Input
                id="coord_nome"
                value={data.coordenador_projeto.nome || ""}
                onChange={(e) =>
                  updateNestedField("coordenador_projeto", "nome", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coord_instituicao">Instituição de Vínculo</Label>
              <Input
                id="coord_instituicao"
                value={data.coordenador_projeto.instituicao_vinculo || ""}
                onChange={(e) =>
                  updateNestedField("coordenador_projeto", "instituicao_vinculo", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coord_departamento">Departamento</Label>
              <Input
                id="coord_departamento"
                value={data.coordenador_projeto.departamento || ""}
                onChange={(e) =>
                  updateNestedField("coordenador_projeto", "departamento", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coord_cargo">Cargo Exercido</Label>
              <Input
                id="coord_cargo"
                value={data.coordenador_projeto.cargo_exercido || ""}
                onChange={(e) =>
                  updateNestedField("coordenador_projeto", "cargo_exercido", e.target.value)
                }
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>E-mails</Label>
              {(data.coordenador_projeto.emails || [""]).map((email, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <Input
                    value={email}
                    onChange={(e) => {
                      const newEmails = [...(data.coordenador_projeto.emails || [])];
                      newEmails[index] = e.target.value;
                      updateNestedField("coordenador_projeto", "emails", newEmails);
                    }}
                    type="email"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeArrayItem("coordenador_projeto" as any, index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newEmails = [...(data.coordenador_projeto.emails || []), ""];
                  updateNestedField("coordenador_projeto", "emails", newEmails);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar E-mail
              </Button>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Telefones</Label>
              {(data.coordenador_projeto.telefones || [""]).map((telefone, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <Input
                    value={telefone}
                    onChange={(e) => {
                      const newTelefones = [...(data.coordenador_projeto.telefones || [])];
                      newTelefones[index] = e.target.value;
                      updateNestedField("coordenador_projeto", "telefones", newTelefones);
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeArrayItem("coordenador_projeto" as any, index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newTelefones = [...(data.coordenador_projeto.telefones || []), ""];
                  updateNestedField("coordenador_projeto", "telefones", newTelefones);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Telefone
              </Button>
            </div>
            <div className="space-y-2 col-span-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="coord_grupo_pesquisa"
                  checked={data.coordenador_projeto.participa_grupo_pesquisa_cnpq === true}
                  onCheckedChange={(checked) =>
                    updateNestedField(
                      "coordenador_projeto",
                      "participa_grupo_pesquisa_cnpq",
                      checked ? true : false
                    )
                  }
                />
                <Label htmlFor="coord_grupo_pesquisa">
                  Participa de Grupo de Pesquisa (CNPq)?
                </Label>
              </div>
              {data.coordenador_projeto.participa_grupo_pesquisa_cnpq && (
                <Input
                  placeholder="Nome do grupo de pesquisa"
                  value={data.coordenador_projeto.grupo_pesquisa_cnpq || ""}
                  onChange={(e) =>
                    updateNestedField("coordenador_projeto", "grupo_pesquisa_cnpq", e.target.value)
                  }
                  className="mt-2"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="coord_lattes">CV Lattes</Label>
              <Input
                id="coord_lattes"
                value={data.coordenador_projeto.cv_lattes || ""}
                onChange={(e) =>
                  updateNestedField("coordenador_projeto", "cv_lattes", e.target.value)
                }
                placeholder="https://lattes.cnpq.br/..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coord_orcid">ORCID</Label>
              <Input
                id="coord_orcid"
                value={data.coordenador_projeto.orcid || ""}
                onChange={(e) =>
                  updateNestedField("coordenador_projeto", "orcid", e.target.value)
                }
                placeholder="https://orcid.org/..."
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="coord_experiencia">Resumo da Experiência Profissional</Label>
              <Textarea
                id="coord_experiencia"
                value={data.coordenador_projeto.resumo_experiencia_profissional || ""}
                onChange={(e) =>
                  updateNestedField(
                    "coordenador_projeto",
                    "resumo_experiencia_profissional",
                    e.target.value
                  )
                }
                rows={4}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Seção 3: Detalhamento do Projeto - Apenas início, continuar depois */}
      <section className="bg-white rounded-lg p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">3. Detalhamento do Projeto</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="modalidade">Modalidade do Projeto</Label>
              <select
                id="modalidade"
                value={data.detalhamento_projeto.modalidade || ""}
                onChange={(e) =>
                  updateNestedField(
                    "detalhamento_projeto",
                    "modalidade",
                    e.target.value || null
                  )
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              >
                <option value="">Selecione...</option>
                {FORM_OPTIONS.modalidades.map((mod) => (
                  <option key={mod.value} value={mod.value}>
                    {mod.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="duracao_meses">Duração do Projeto (meses)</Label>
              <Input
                id="duracao_meses"
                type="number"
                min="1"
                max="36"
                value={data.detalhamento_projeto.duracao_meses || ""}
                onChange={(e) =>
                  updateNestedField(
                    "detalhamento_projeto",
                    "duracao_meses",
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor_projeto">Valor do Projeto (R$)</Label>
              <Input
                id="valor_projeto"
                value={data.detalhamento_projeto.valor_projeto || ""}
                onChange={(e) =>
                  updateNestedField("detalhamento_projeto", "valor_projeto", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="possui_outras_fontes"
                  checked={data.detalhamento_projeto.possui_outras_fontes_fomento === true}
                  onCheckedChange={(checked) =>
                    updateNestedField(
                      "detalhamento_projeto",
                      "possui_outras_fontes_fomento",
                      checked ? true : false
                    )
                  }
                />
                <Label htmlFor="possui_outras_fontes">Possui Outras Fontes de Fomento?</Label>
              </div>
              {data.detalhamento_projeto.possui_outras_fontes_fomento && (
                <Textarea
                  placeholder="Especificar outras fontes"
                  value={data.detalhamento_projeto.outras_fontes_fomento || ""}
                  onChange={(e) =>
                    updateNestedField("detalhamento_projeto", "outras_fontes_fomento", e.target.value)
                  }
                  rows={2}
                  className="mt-2"
                />
              )}
            </div>
          </div>

          {/* ODS */}
          <div className="space-y-2">
            <Label>ODS - Objetivos do Desenvolvimento Sustentável</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORM_OPTIONS.ods.map((ods) => {
                const isChecked =
                  data.detalhamento_projeto.ods_selecionados?.includes(ods.id) || false;
                return (
                  <div key={ods.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`ods-${ods.id}`}
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const currentODS = [...(data.detalhamento_projeto.ods_selecionados || [])];
                        if (checked) {
                          if (!currentODS.includes(ods.id)) {
                            currentODS.push(ods.id);
                          }
                        } else {
                          const index = currentODS.indexOf(ods.id);
                          if (index > -1) {
                            currentODS.splice(index, 1);
                          }
                        }
                        updateNestedField("detalhamento_projeto", "ods_selecionados", currentODS);
                      }}
                    />
                    <Label htmlFor={`ods-${ods.id}`} className="font-normal text-sm">
                      {ods.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grande Área do Conhecimento */}
          <div className="space-y-2">
            <Label htmlFor="grande_area">Grande Área do Conhecimento (CNPq)</Label>
            <select
              id="grande_area"
              value={data.detalhamento_projeto.grande_area_conhecimento || ""}
              onChange={(e) =>
                updateNestedField(
                  "detalhamento_projeto",
                  "grande_area_conhecimento",
                  e.target.value ? parseInt(e.target.value) : null
                )
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            >
              <option value="">Selecione...</option>
              {FORM_OPTIONS.grandes_areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.label}
                </option>
              ))}
            </select>
          </div>

          {/* Subáreas do Conhecimento */}
          <div className="space-y-2">
            <Label>Subáreas do Conhecimento</Label>
            {(data.detalhamento_projeto.subareas_conhecimento || []).map((subarea, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Código (ex: 01.02.03.04)"
                  value={subarea.codigo || ""}
                  onChange={(e) => {
                    const newSubareas = [...(data.detalhamento_projeto.subareas_conhecimento || [])];
                    newSubareas[index] = { ...newSubareas[index], codigo: e.target.value };
                    updateNestedField("detalhamento_projeto", "subareas_conhecimento", newSubareas);
                  }}
                  className="flex-1"
                />
                <Input
                  placeholder="Nome da subárea"
                  value={subarea.nome || ""}
                  onChange={(e) => {
                    const newSubareas = [...(data.detalhamento_projeto.subareas_conhecimento || [])];
                    newSubareas[index] = { ...newSubareas[index], nome: e.target.value };
                    updateNestedField("detalhamento_projeto", "subareas_conhecimento", newSubareas);
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newSubareas = (data.detalhamento_projeto.subareas_conhecimento || []).filter(
                      (_, i) => i !== index
                    );
                    updateNestedField("detalhamento_projeto", "subareas_conhecimento", newSubareas);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newSubareas = [
                  ...(data.detalhamento_projeto.subareas_conhecimento || []),
                  { codigo: "", nome: "" },
                ];
                updateNestedField("detalhamento_projeto", "subareas_conhecimento", newSubareas);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Subárea
            </Button>
          </div>

          {/* Tipo de Contribuição/Inovação */}
          <div className="space-y-2">
            <Label>Tipo de Contribuição/Inovação</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORM_OPTIONS.tipo_contribuicao.map((tipo) => {
                const isChecked =
                  data.detalhamento_projeto.tipo_contribuicao_inovacao?.includes(
                    tipo.value as any
                  ) || false;
                return (
                  <div key={tipo.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`tipo-${tipo.value}`}
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const currentTipos = [
                          ...(data.detalhamento_projeto.tipo_contribuicao_inovacao || []),
                        ];
                        if (checked) {
                          if (!currentTipos.includes(tipo.value as any)) {
                            currentTipos.push(tipo.value as any);
                          }
                        } else {
                          const index = currentTipos.indexOf(tipo.value as any);
                          if (index > -1) {
                            currentTipos.splice(index, 1);
                          }
                        }
                        updateNestedField(
                          "detalhamento_projeto",
                          "tipo_contribuicao_inovacao",
                          currentTipos
                        );
                      }}
                    />
                    <Label htmlFor={`tipo-${tipo.value}`} className="font-normal">
                      {tipo.label}
                    </Label>
                  </div>
                );
              })}
            </div>
            {data.detalhamento_projeto.tipo_contribuicao_inovacao?.length > 0 &&
              !data.detalhamento_projeto.tipo_contribuicao_inovacao.includes("nao_se_aplica") && (
                <Textarea
                  placeholder="Caracterização da Contribuição/Inovação (até 1000 palavras)"
                  value={data.detalhamento_projeto.caracterizacao_contribuicao_inovacao || ""}
                  onChange={(e) =>
                    updateNestedField(
                      "detalhamento_projeto",
                      "caracterizacao_contribuicao_inovacao",
                      e.target.value
                    )
                  }
                  rows={8}
                  className="mt-2"
                />
              )}
          </div>

          {/* Campos de texto longo */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resumo_publicavel">
                3.1. Resumo (Publicável pela FAPES) - até 500 palavras
              </Label>
              <Textarea
                id="resumo_publicavel"
                value={data.detalhamento_projeto.resumo_publicavel || ""}
                onChange={(e) =>
                  updateNestedField("detalhamento_projeto", "resumo_publicavel", e.target.value)
                }
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="palavras_chave">3.2. Palavras-chave (até 6 palavras)</Label>
              <Input
                id="palavras_chave"
                value={(data.detalhamento_projeto.palavras_chave || []).join(", ")}
                onChange={(e) => {
                  const palavras = e.target.value.split(",").map((p) => p.trim()).filter(Boolean);
                  updateNestedField("detalhamento_projeto", "palavras_chave", palavras);
                }}
                placeholder="palavra1, palavra2, palavra3..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="caracterizacao_problema">
                3.3. Caracterização do Problema Científico e/ou Tecnológico (até 2500 palavras)
              </Label>
              <Textarea
                id="caracterizacao_problema"
                value={data.detalhamento_projeto.caracterizacao_problema || ""}
                onChange={(e) =>
                  updateNestedField("detalhamento_projeto", "caracterizacao_problema", e.target.value)
                }
                rows={12}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="potencial_fortalecimento">
                3.4. Potencial da Proposta para o Fortalecimento da Linha de Pesquisa
              </Label>
              <Textarea
                id="potencial_fortalecimento"
                value={data.detalhamento_projeto.potencial_fortalecimento_linha_pesquisa || ""}
                onChange={(e) =>
                  updateNestedField(
                    "detalhamento_projeto",
                    "potencial_fortalecimento_linha_pesquisa",
                    e.target.value
                  )
                }
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao_avanco">
                3.5. Descrição do Avanço em CT&I (até 1000 palavras)
              </Label>
              <Textarea
                id="descricao_avanco"
                value={data.detalhamento_projeto.descricao_avancao_cti || ""}
                onChange={(e) =>
                  updateNestedField("detalhamento_projeto", "descricao_avancao_cti", e.target.value)
                }
                rows={8}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qualificacao_equipe">3.6. Qualificação da Equipe do Projeto</Label>
              <Textarea
                id="qualificacao_equipe"
                value={data.detalhamento_projeto.qualificacao_equipe || ""}
                onChange={(e) =>
                  updateNestedField("detalhamento_projeto", "qualificacao_equipe", e.target.value)
                }
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="objetivo_geral">3.7. Objetivo Geral (até 100 palavras)</Label>
              <Textarea
                id="objetivo_geral"
                value={data.detalhamento_projeto.objetivo_geral || ""}
                onChange={(e) =>
                  updateNestedField("detalhamento_projeto", "objetivo_geral", e.target.value)
                }
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>3.7.1. Objetivos Específicos</Label>
              {(data.detalhamento_projeto.objetivos_especificos || []).map((obj, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Objetivo Específico {index + 1}</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newObjetivos = (
                          data.detalhamento_projeto.objetivos_especificos || []
                        ).filter((_, i) => i !== index);
                        updateNestedField("detalhamento_projeto", "objetivos_especificos", newObjetivos);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Descrição do objetivo específico"
                    value={obj.descricao || ""}
                    onChange={(e) => {
                      const newObjetivos = [
                        ...(data.detalhamento_projeto.objetivos_especificos || []),
                      ];
                      newObjetivos[index] = { ...newObjetivos[index], descricao: e.target.value };
                      updateNestedField("detalhamento_projeto", "objetivos_especificos", newObjetivos);
                    }}
                    rows={3}
                  />
                  {/* Aqui podemos adicionar campos para entregas, responsáveis e cronograma depois */}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newObjetivos = [
                    ...(data.detalhamento_projeto.objetivos_especificos || []),
                    { descricao: "", entregas: [], criterios_aceitacao: "", responsaveis: [], cronograma: {} },
                  ];
                  updateNestedField("detalhamento_projeto", "objetivos_especificos", newObjetivos);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Objetivo Específico
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="detalhamento">
                3.8. Detalhamento do Projeto (até 3000 palavras)
              </Label>
              <Textarea
                id="detalhamento"
                value={data.detalhamento_projeto.detalhamento_projeto || ""}
                onChange={(e) =>
                  updateNestedField("detalhamento_projeto", "detalhamento_projeto", e.target.value)
                }
                rows={12}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="interdisciplinaridade">
                3.9. Caracterização da Interdisciplinaridade (até 1000 palavras)
              </Label>
              <Textarea
                id="interdisciplinaridade"
                value={data.detalhamento_projeto.caracterizacao_interdisciplinaridade || ""}
                onChange={(e) =>
                  updateNestedField(
                    "detalhamento_projeto",
                    "caracterizacao_interdisciplinaridade",
                    e.target.value
                  )
                }
                rows={8}
              />
            </div>

            {/* 3.10 Promoção e Divulgação */}
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
              <h3 className="font-semibold text-gray-900">3.10. Plano para Promoção e Divulgação</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="publico_alvo">3.10.1. Público-alvo (até 300 palavras)</Label>
                  <Textarea
                    id="publico_alvo"
                    value={data.detalhamento_projeto.promocao_popularizacao?.publico_alvo || ""}
                    onChange={(e) =>
                      updateNestedField(
                        "detalhamento_projeto",
                        "promocao_popularizacao",
                        {
                          ...data.detalhamento_projeto.promocao_popularizacao,
                          publico_alvo: e.target.value,
                        }
                      )
                    }
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estrategias_traducao">
                    3.10.2. Estratégias de Tradução do Conhecimento (até 1000 palavras)
                  </Label>
                  <Textarea
                    id="estrategias_traducao"
                    value={
                      data.detalhamento_projeto.promocao_popularizacao
                        ?.estrategias_traducao_conhecimento || ""
                    }
                    onChange={(e) =>
                      updateNestedField(
                        "detalhamento_projeto",
                        "promocao_popularizacao",
                        {
                          ...data.detalhamento_projeto.promocao_popularizacao,
                          estrategias_traducao_conhecimento: e.target.value,
                        }
                      )
                    }
                    rows={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estrategias_disseminacao">
                    3.10.3. Estratégias de Disseminação do Conhecimento
                  </Label>
                  <Textarea
                    id="estrategias_disseminacao"
                    value={
                      data.detalhamento_projeto.promocao_popularizacao
                        ?.estrategias_disseminacao_conhecimento || ""
                    }
                    onChange={(e) =>
                      updateNestedField(
                        "detalhamento_projeto",
                        "promocao_popularizacao",
                        {
                          ...data.detalhamento_projeto.promocao_popularizacao,
                          estrategias_disseminacao_conhecimento: e.target.value,
                        }
                      )
                    }
                    rows={8}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="beneficios">3.11. Benefícios/Resultados Esperados (até 1000 palavras)</Label>
              <Textarea
                id="beneficios"
                value={data.detalhamento_projeto.beneficios_resultados_esperados || ""}
                onChange={(e) =>
                  updateNestedField(
                    "detalhamento_projeto",
                    "beneficios_resultados_esperados",
                    e.target.value
                  )
                }
                rows={8}
              />
            </div>

            {/* 3.12 Impactos Esperados */}
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
              <h3 className="font-semibold text-gray-900">3.12. Impactos Esperados</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="impacto_cientifico">Impacto Científico</Label>
                  <Textarea
                    id="impacto_cientifico"
                    value={data.detalhamento_projeto.impactos_esperados?.impacto_cientifico || ""}
                    onChange={(e) =>
                      updateNestedField(
                        "detalhamento_projeto",
                        "impactos_esperados",
                        {
                          ...data.detalhamento_projeto.impactos_esperados,
                          impacto_cientifico: e.target.value,
                        }
                      )
                    }
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="impacto_tecnologico">Impacto Tecnológico</Label>
                  <Textarea
                    id="impacto_tecnologico"
                    value={data.detalhamento_projeto.impactos_esperados?.impacto_tecnologico || ""}
                    onChange={(e) =>
                      updateNestedField(
                        "detalhamento_projeto",
                        "impactos_esperados",
                        {
                          ...data.detalhamento_projeto.impactos_esperados,
                          impacto_tecnologico: e.target.value,
                        }
                      )
                    }
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="impacto_economico">Impacto Econômico</Label>
                  <Textarea
                    id="impacto_economico"
                    value={data.detalhamento_projeto.impactos_esperados?.impacto_economico || ""}
                    onChange={(e) =>
                      updateNestedField(
                        "detalhamento_projeto",
                        "impactos_esperados",
                        {
                          ...data.detalhamento_projeto.impactos_esperados,
                          impacto_economico: e.target.value,
                        }
                      )
                    }
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="impacto_social">Impacto Social e Ambiental</Label>
                  <Textarea
                    id="impacto_social"
                    value={
                      data.detalhamento_projeto.impactos_esperados?.impacto_social_ambiental || ""
                    }
                    onChange={(e) =>
                      updateNestedField(
                        "detalhamento_projeto",
                        "impactos_esperados",
                        {
                          ...data.detalhamento_projeto.impactos_esperados,
                          impacto_social_ambiental: e.target.value,
                        }
                      )
                    }
                    rows={4}
                  />
                </div>
              </div>
            </div>

            {/* 3.13 Indicadores */}
            <div className="space-y-2">
              <Label>3.13. Indicadores de Acompanhamento e Avaliação</Label>
              {(data.detalhamento_projeto.indicadores_acompanhamento || []).map((indicador, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Indicador {index + 1}</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newIndicadores = (
                          data.detalhamento_projeto.indicadores_acompanhamento || []
                        ).filter((_, i) => i !== index);
                        updateNestedField(
                          "detalhamento_projeto",
                          "indicadores_acompanhamento",
                          newIndicadores
                        );
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Indicador"
                      value={indicador.indicador || ""}
                      onChange={(e) => {
                        const newIndicadores = [
                          ...(data.detalhamento_projeto.indicadores_acompanhamento || []),
                        ];
                        newIndicadores[index] = { ...newIndicadores[index], indicador: e.target.value };
                        updateNestedField(
                          "detalhamento_projeto",
                          "indicadores_acompanhamento",
                          newIndicadores
                        );
                      }}
                    />
                    <Input
                      placeholder="Unidade de Medida"
                      value={indicador.unidade_medida || ""}
                      onChange={(e) => {
                        const newIndicadores = [
                          ...(data.detalhamento_projeto.indicadores_acompanhamento || []),
                        ];
                        newIndicadores[index] = {
                          ...newIndicadores[index],
                          unidade_medida: e.target.value,
                        };
                        updateNestedField(
                          "detalhamento_projeto",
                          "indicadores_acompanhamento",
                          newIndicadores
                        );
                      }}
                    />
                    <Input
                      placeholder="Meta"
                      value={indicador.meta || ""}
                      onChange={(e) => {
                        const newIndicadores = [
                          ...(data.detalhamento_projeto.indicadores_acompanhamento || []),
                        ];
                        newIndicadores[index] = { ...newIndicadores[index], meta: e.target.value };
                        updateNestedField(
                          "detalhamento_projeto",
                          "indicadores_acompanhamento",
                          newIndicadores
                        );
                      }}
                    />
                    <Input
                      placeholder="Prazo"
                      value={indicador.prazo || ""}
                      onChange={(e) => {
                        const newIndicadores = [
                          ...(data.detalhamento_projeto.indicadores_acompanhamento || []),
                        ];
                        newIndicadores[index] = { ...newIndicadores[index], prazo: e.target.value };
                        updateNestedField(
                          "detalhamento_projeto",
                          "indicadores_acompanhamento",
                          newIndicadores
                        );
                      }}
                    />
                    <Input
                      placeholder="Frequência de Acompanhamento"
                      value={indicador.frequencia_acompanhamento || ""}
                      onChange={(e) => {
                        const newIndicadores = [
                          ...(data.detalhamento_projeto.indicadores_acompanhamento || []),
                        ];
                        newIndicadores[index] = {
                          ...newIndicadores[index],
                          frequencia_acompanhamento: e.target.value,
                        };
                        updateNestedField(
                          "detalhamento_projeto",
                          "indicadores_acompanhamento",
                          newIndicadores
                        );
                      }}
                    />
                    <Input
                      placeholder="Fonte de Verificação"
                      value={indicador.fonte_verificacao || ""}
                      onChange={(e) => {
                        const newIndicadores = [
                          ...(data.detalhamento_projeto.indicadores_acompanhamento || []),
                        ];
                        newIndicadores[index] = {
                          ...newIndicadores[index],
                          fonte_verificacao: e.target.value,
                        };
                        updateNestedField(
                          "detalhamento_projeto",
                          "indicadores_acompanhamento",
                          newIndicadores
                        );
                      }}
                    />
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newIndicadores = [
                    ...(data.detalhamento_projeto.indicadores_acompanhamento || []),
                    {
                      indicador: "",
                      unidade_medida: "",
                      meta: "",
                      prazo: "",
                      frequencia_acompanhamento: "",
                      fonte_verificacao: "",
                    },
                  ];
                  updateNestedField("detalhamento_projeto", "indicadores_acompanhamento", newIndicadores);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Indicador
              </Button>
            </div>

            {/* 3.14 Riscos */}
            <div className="space-y-2">
              <Label>3.14. Riscos e Estratégias de Mitigação</Label>
              {(data.detalhamento_projeto.riscos_mitigacao || []).map((risco, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Risco {index + 1}</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newRiscos = (data.detalhamento_projeto.riscos_mitigacao || []).filter(
                          (_, i) => i !== index
                        );
                        updateNestedField("detalhamento_projeto", "riscos_mitigacao", newRiscos);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Risco"
                      value={risco.risco || ""}
                      onChange={(e) => {
                        const newRiscos = [...(data.detalhamento_projeto.riscos_mitigacao || [])];
                        newRiscos[index] = { ...newRiscos[index], risco: e.target.value };
                        updateNestedField("detalhamento_projeto", "riscos_mitigacao", newRiscos);
                      }}
                    />
                    <Input
                      placeholder="Probabilidade"
                      value={risco.probabilidade || ""}
                      onChange={(e) => {
                        const newRiscos = [...(data.detalhamento_projeto.riscos_mitigacao || [])];
                        newRiscos[index] = { ...newRiscos[index], probabilidade: e.target.value };
                        updateNestedField("detalhamento_projeto", "riscos_mitigacao", newRiscos);
                      }}
                    />
                    <Input
                      placeholder="Impacto"
                      value={risco.impacto || ""}
                      onChange={(e) => {
                        const newRiscos = [...(data.detalhamento_projeto.riscos_mitigacao || [])];
                        newRiscos[index] = { ...newRiscos[index], impacto: e.target.value };
                        updateNestedField("detalhamento_projeto", "riscos_mitigacao", newRiscos);
                      }}
                    />
                  </div>
                  <Textarea
                    placeholder="Estratégia de Mitigação"
                    value={risco.estrategia_mitigacao || ""}
                    onChange={(e) => {
                      const newRiscos = [...(data.detalhamento_projeto.riscos_mitigacao || [])];
                      newRiscos[index] = { ...newRiscos[index], estrategia_mitigacao: e.target.value };
                      updateNestedField("detalhamento_projeto", "riscos_mitigacao", newRiscos);
                    }}
                    rows={3}
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newRiscos = [
                    ...(data.detalhamento_projeto.riscos_mitigacao || []),
                    { risco: "", probabilidade: "", impacto: "", estrategia_mitigacao: "" },
                  ];
                  updateNestedField("detalhamento_projeto", "riscos_mitigacao", newRiscos);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Risco
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="infraestrutura">
                3.15. Infraestrutura e Apoio Técnico (até 1000 palavras)
              </Label>
              <Textarea
                id="infraestrutura"
                value={data.detalhamento_projeto.infraestrutura_apoio_tecnico || ""}
                onChange={(e) =>
                  updateNestedField(
                    "detalhamento_projeto",
                    "infraestrutura_apoio_tecnico",
                    e.target.value
                  )
                }
                rows={8}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="referencias">3.16. Referências</Label>
              <Textarea
                id="referencias"
                value={data.detalhamento_projeto.referencias || ""}
                onChange={(e) =>
                  updateNestedField("detalhamento_projeto", "referencias", e.target.value)
                }
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="declaracao"
                  checked={data.detalhamento_projeto.declaracao_proponente || false}
                  onCheckedChange={(checked) =>
                    updateNestedField(
                      "detalhamento_projeto",
                      "declaracao_proponente",
                      checked === true
                    )
                  }
                />
                <Label htmlFor="declaracao">
                  3.17. Declaração do(a) Proponente - Declaro que tenho conhecimento da sistemática
                  adotada...
                </Label>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Seção 4: Equipe do Projeto */}
      <section className="bg-white rounded-lg p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">4. Equipe do Projeto</h2>
        <div className="space-y-4">
          {(data.equipe_projeto || []).map((membro, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Membro {index + 1}</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newEquipe = (data.equipe_projeto || []).filter((_, i) => i !== index);
                    updateField("equipe_projeto", newEquipe);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Nome"
                  value={membro.nome || ""}
                  onChange={(e) => {
                    const newEquipe = [...(data.equipe_projeto || [])];
                    newEquipe[index] = { ...newEquipe[index], nome: e.target.value };
                    updateField("equipe_projeto", newEquipe);
                  }}
                />
                <Input
                  placeholder="Função/Papel"
                  value={membro.funcao || ""}
                  onChange={(e) => {
                    const newEquipe = [...(data.equipe_projeto || [])];
                    newEquipe[index] = { ...newEquipe[index], funcao: e.target.value };
                    updateField("equipe_projeto", newEquipe);
                  }}
                />
                <Input
                  placeholder="Carga Horária Dedicada"
                  value={membro.carga_horaria || ""}
                  onChange={(e) => {
                    const newEquipe = [...(data.equipe_projeto || [])];
                    newEquipe[index] = { ...newEquipe[index], carga_horaria: e.target.value };
                    updateField("equipe_projeto", newEquipe);
                  }}
                />
                <Input
                  placeholder="Instituição de Vínculo"
                  value={membro.instituicao_vinculo || ""}
                  onChange={(e) => {
                    const newEquipe = [...(data.equipe_projeto || [])];
                    newEquipe[index] = { ...newEquipe[index], instituicao_vinculo: e.target.value };
                    updateField("equipe_projeto", newEquipe);
                  }}
                />
                <Input
                  placeholder="E-mail"
                  type="email"
                  value={membro.email || ""}
                  onChange={(e) => {
                    const newEquipe = [...(data.equipe_projeto || [])];
                    newEquipe[index] = { ...newEquipe[index], email: e.target.value };
                    updateField("equipe_projeto", newEquipe);
                  }}
                  className="col-span-2"
                />
                <Textarea
                  placeholder="Responsabilidades"
                  value={membro.responsabilidades || ""}
                  onChange={(e) => {
                    const newEquipe = [...(data.equipe_projeto || [])];
                    newEquipe[index] = { ...newEquipe[index], responsabilidades: e.target.value };
                    updateField("equipe_projeto", newEquipe);
                  }}
                  rows={3}
                  className="col-span-2"
                />
                <Textarea
                  placeholder="Descrição do Currículo Vitae"
                  value={membro.descricao_curriculo || ""}
                  onChange={(e) => {
                    const newEquipe = [...(data.equipe_projeto || [])];
                    newEquipe[index] = { ...newEquipe[index], descricao_curriculo: e.target.value };
                    updateField("equipe_projeto", newEquipe);
                  }}
                  rows={3}
                  className="col-span-2"
                />
                <Input
                  placeholder="Link CV Lattes"
                  value={membro.cv_lattes || ""}
                  onChange={(e) => {
                    const newEquipe = [...(data.equipe_projeto || [])];
                    newEquipe[index] = { ...newEquipe[index], cv_lattes: e.target.value };
                    updateField("equipe_projeto", newEquipe);
                  }}
                  className="col-span-2"
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newEquipe = [
                ...(data.equipe_projeto || []),
                {
                  nome: "",
                  funcao: "",
                  carga_horaria: "",
                  instituicao_vinculo: "",
                  email: "",
                  responsabilidades: "",
                  descricao_curriculo: "",
                  cv_lattes: "",
                },
              ];
              updateField("equipe_projeto", newEquipe);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Membro da Equipe
          </Button>
        </div>
      </section>

      {/* Seção 5: Cronograma - será implementado depois */}
      <section className="bg-white rounded-lg p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">5. Cronograma Físico do Projeto</h2>
        <p className="text-gray-500">Cronograma será implementado em breve...</p>
      </section>

      {/* Seção 6: Recursos Financeiros */}
      <section className="bg-white rounded-lg p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          6. Execução dos Recursos Financeiros
        </h2>

        {/* Materiais Permanentes */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Aquisição de Materiais Permanentes
          </h3>
          {(data.recursos_financeiros.materiais_permanentes || []).map((item, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg mb-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Item {index + 1}</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newItems = (
                      data.recursos_financeiros.materiais_permanentes || []
                    ).filter((_, i) => i !== index);
                    updateNestedField("recursos_financeiros", "materiais_permanentes", newItems);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Detalhamento da Despesa"
                  value={item.detalhamento || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.materiais_permanentes || [])];
                    newItems[index] = { ...newItems[index], detalhamento: e.target.value };
                    updateNestedField("recursos_financeiros", "materiais_permanentes", newItems);
                  }}
                  className="col-span-2"
                />
                <Textarea
                  placeholder="Justificativa"
                  value={item.justificativa || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.materiais_permanentes || [])];
                    newItems[index] = { ...newItems[index], justificativa: e.target.value };
                    updateNestedField("recursos_financeiros", "materiais_permanentes", newItems);
                  }}
                  rows={2}
                  className="col-span-2"
                />
                <Input
                  placeholder="Unidade"
                  value={item.unidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.materiais_permanentes || [])];
                    newItems[index] = { ...newItems[index], unidade: e.target.value };
                    updateNestedField("recursos_financeiros", "materiais_permanentes", newItems);
                  }}
                />
                <Input
                  placeholder="Quantidade"
                  type="number"
                  value={item.quantidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.materiais_permanentes || [])];
                    newItems[index] = {
                      ...newItems[index],
                      quantidade: e.target.value ? parseFloat(e.target.value) : 0,
                    };
                    updateNestedField("recursos_financeiros", "materiais_permanentes", newItems);
                  }}
                />
                <Input
                  placeholder="Custo Unitário (R$)"
                  type="number"
                  step="0.01"
                  value={item.custo_unitario || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.materiais_permanentes || [])];
                    const custoUnitario = e.target.value ? parseFloat(e.target.value) : 0;
                    newItems[index] = {
                      ...newItems[index],
                      custo_unitario: custoUnitario,
                      custo_total: (newItems[index].quantidade || 0) * custoUnitario,
                    };
                    updateNestedField("recursos_financeiros", "materiais_permanentes", newItems);
                  }}
                />
                <Input
                  placeholder="Custo Total (R$)"
                  type="number"
                  value={item.custo_total || ""}
                  disabled
                  className="bg-gray-100"
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newItems = [
                ...(data.recursos_financeiros.materiais_permanentes || []),
                {
                  detalhamento: "",
                  justificativa: "",
                  unidade: "",
                  quantidade: 0,
                  custo_unitario: 0,
                  custo_total: 0,
                },
              ];
              updateNestedField("recursos_financeiros", "materiais_permanentes", newItems);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Material Permanente
          </Button>
        </div>

        {/* Materiais de Consumo */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Despesas com Material de Consumo</h3>
          {(data.recursos_financeiros.materiais_consumo || []).map((item, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg mb-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Item {index + 1}</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newItems = (data.recursos_financeiros.materiais_consumo || []).filter(
                      (_, i) => i !== index
                    );
                    updateNestedField("recursos_financeiros", "materiais_consumo", newItems);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Detalhamento"
                  value={item.detalhamento || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.materiais_consumo || [])];
                    newItems[index] = { ...newItems[index], detalhamento: e.target.value };
                    updateNestedField("recursos_financeiros", "materiais_consumo", newItems);
                  }}
                  className="col-span-2"
                />
                <Textarea
                  placeholder="Justificativa"
                  value={item.justificativa || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.materiais_consumo || [])];
                    newItems[index] = { ...newItems[index], justificativa: e.target.value };
                    updateNestedField("recursos_financeiros", "materiais_consumo", newItems);
                  }}
                  rows={2}
                  className="col-span-2"
                />
                <Input
                  placeholder="Unidade"
                  value={item.unidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.materiais_consumo || [])];
                    newItems[index] = { ...newItems[index], unidade: e.target.value };
                    updateNestedField("recursos_financeiros", "materiais_consumo", newItems);
                  }}
                />
                <Input
                  placeholder="Quantidade"
                  type="number"
                  value={item.quantidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.materiais_consumo || [])];
                    newItems[index] = {
                      ...newItems[index],
                      quantidade: e.target.value ? parseFloat(e.target.value) : 0,
                    };
                    updateNestedField("recursos_financeiros", "materiais_consumo", newItems);
                  }}
                />
                <Input
                  placeholder="Custo Unitário (R$)"
                  type="number"
                  step="0.01"
                  value={item.custo_unitario || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.materiais_consumo || [])];
                    const custoUnitario = e.target.value ? parseFloat(e.target.value) : 0;
                    newItems[index] = {
                      ...newItems[index],
                      custo_unitario: custoUnitario,
                      custo_total: (newItems[index].quantidade || 0) * custoUnitario,
                    };
                    updateNestedField("recursos_financeiros", "materiais_consumo", newItems);
                  }}
                />
                <Input
                  placeholder="Custo Total (R$)"
                  type="number"
                  value={item.custo_total || ""}
                  disabled
                  className="bg-gray-100"
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newItems = [
                ...(data.recursos_financeiros.materiais_consumo || []),
                {
                  detalhamento: "",
                  justificativa: "",
                  unidade: "",
                  quantidade: 0,
                  custo_unitario: 0,
                  custo_total: 0,
                },
              ];
              updateNestedField("recursos_financeiros", "materiais_consumo", newItems);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Material de Consumo
          </Button>
        </div>

        {/* Passagens e Diárias */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Despesas com Passagens e Diárias</h3>
          {(data.recursos_financeiros.passagens_diarias || []).map((item, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg mb-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Item {index + 1}</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newItems = (data.recursos_financeiros.passagens_diarias || []).filter(
                      (_, i) => i !== index
                    );
                    updateNestedField("recursos_financeiros", "passagens_diarias", newItems);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Detalhamento"
                  value={item.detalhamento || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.passagens_diarias || [])];
                    newItems[index] = { ...newItems[index], detalhamento: e.target.value };
                    updateNestedField("recursos_financeiros", "passagens_diarias", newItems);
                  }}
                  className="col-span-2"
                />
                <Textarea
                  placeholder="Justificativa"
                  value={item.justificativa || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.passagens_diarias || [])];
                    newItems[index] = { ...newItems[index], justificativa: e.target.value };
                    updateNestedField("recursos_financeiros", "passagens_diarias", newItems);
                  }}
                  rows={2}
                  className="col-span-2"
                />
                <Input
                  placeholder="Unidade"
                  value={item.unidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.passagens_diarias || [])];
                    newItems[index] = { ...newItems[index], unidade: e.target.value };
                    updateNestedField("recursos_financeiros", "passagens_diarias", newItems);
                  }}
                />
                <Input
                  placeholder="Quantidade"
                  type="number"
                  value={item.quantidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.passagens_diarias || [])];
                    newItems[index] = {
                      ...newItems[index],
                      quantidade: e.target.value ? parseFloat(e.target.value) : 0,
                    };
                    updateNestedField("recursos_financeiros", "passagens_diarias", newItems);
                  }}
                />
                <Input
                  placeholder="Custo Unitário (R$)"
                  type="number"
                  step="0.01"
                  value={item.custo_unitario || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.passagens_diarias || [])];
                    const custoUnitario = e.target.value ? parseFloat(e.target.value) : 0;
                    newItems[index] = {
                      ...newItems[index],
                      custo_unitario: custoUnitario,
                      custo_total: (newItems[index].quantidade || 0) * custoUnitario,
                    };
                    updateNestedField("recursos_financeiros", "passagens_diarias", newItems);
                  }}
                />
                <Input
                  placeholder="Custo Total (R$)"
                  type="number"
                  value={item.custo_total || ""}
                  disabled
                  className="bg-gray-100"
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newItems = [
                ...(data.recursos_financeiros.passagens_diarias || []),
                {
                  detalhamento: "",
                  justificativa: "",
                  unidade: "",
                  quantidade: 0,
                  custo_unitario: 0,
                  custo_total: 0,
                },
              ];
              updateNestedField("recursos_financeiros", "passagens_diarias", newItems);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Passagem/Diária
          </Button>
        </div>

        {/* Serviços de Terceiros */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Despesas com Serviços de Terceiros
          </h3>
          {(data.recursos_financeiros.servicos_terceiros || []).map((item, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg mb-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Item {index + 1}</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newItems = (data.recursos_financeiros.servicos_terceiros || []).filter(
                      (_, i) => i !== index
                    );
                    updateNestedField("recursos_financeiros", "servicos_terceiros", newItems);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Detalhamento"
                  value={item.detalhamento || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.servicos_terceiros || [])];
                    newItems[index] = { ...newItems[index], detalhamento: e.target.value };
                    updateNestedField("recursos_financeiros", "servicos_terceiros", newItems);
                  }}
                  className="col-span-2"
                />
                <Textarea
                  placeholder="Justificativa"
                  value={item.justificativa || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.servicos_terceiros || [])];
                    newItems[index] = { ...newItems[index], justificativa: e.target.value };
                    updateNestedField("recursos_financeiros", "servicos_terceiros", newItems);
                  }}
                  rows={2}
                  className="col-span-2"
                />
                <Input
                  placeholder="Unidade"
                  value={item.unidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.servicos_terceiros || [])];
                    newItems[index] = { ...newItems[index], unidade: e.target.value };
                    updateNestedField("recursos_financeiros", "servicos_terceiros", newItems);
                  }}
                />
                <Input
                  placeholder="Quantidade"
                  type="number"
                  value={item.quantidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.servicos_terceiros || [])];
                    newItems[index] = {
                      ...newItems[index],
                      quantidade: e.target.value ? parseFloat(e.target.value) : 0,
                    };
                    updateNestedField("recursos_financeiros", "servicos_terceiros", newItems);
                  }}
                />
                <Input
                  placeholder="Custo Unitário (R$)"
                  type="number"
                  step="0.01"
                  value={item.custo_unitario || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.servicos_terceiros || [])];
                    const custoUnitario = e.target.value ? parseFloat(e.target.value) : 0;
                    newItems[index] = {
                      ...newItems[index],
                      custo_unitario: custoUnitario,
                      custo_total: (newItems[index].quantidade || 0) * custoUnitario,
                    };
                    updateNestedField("recursos_financeiros", "servicos_terceiros", newItems);
                  }}
                />
                <Input
                  placeholder="Custo Total (R$)"
                  type="number"
                  value={item.custo_total || ""}
                  disabled
                  className="bg-gray-100"
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newItems = [
                ...(data.recursos_financeiros.servicos_terceiros || []),
                {
                  detalhamento: "",
                  justificativa: "",
                  unidade: "",
                  quantidade: 0,
                  custo_unitario: 0,
                  custo_total: 0,
                },
              ];
              updateNestedField("recursos_financeiros", "servicos_terceiros", newItems);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Serviço de Terceiro
          </Button>
        </div>

        {/* Bolsas */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Bolsas</h3>
          {(data.recursos_financeiros.bolsas || []).map((item, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg mb-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Item {index + 1}</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newItems = (data.recursos_financeiros.bolsas || []).filter(
                      (_, i) => i !== index
                    );
                    updateNestedField("recursos_financeiros", "bolsas", newItems);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Modalidade de Bolsa"
                  value={item.modalidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.bolsas || [])];
                    newItems[index] = { ...newItems[index], modalidade: e.target.value };
                    updateNestedField("recursos_financeiros", "bolsas", newItems);
                  }}
                  className="col-span-2"
                />
                <Textarea
                  placeholder="Justificativa"
                  value={item.justificativa || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.bolsas || [])];
                    newItems[index] = { ...newItems[index], justificativa: e.target.value };
                    updateNestedField("recursos_financeiros", "bolsas", newItems);
                  }}
                  rows={2}
                  className="col-span-2"
                />
                <Input
                  placeholder="Unidade"
                  value={item.unidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.bolsas || [])];
                    newItems[index] = { ...newItems[index], unidade: e.target.value };
                    updateNestedField("recursos_financeiros", "bolsas", newItems);
                  }}
                />
                <Input
                  placeholder="Quantidade"
                  type="number"
                  value={item.quantidade || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.bolsas || [])];
                    newItems[index] = {
                      ...newItems[index],
                      quantidade: e.target.value ? parseFloat(e.target.value) : 0,
                    };
                    updateNestedField("recursos_financeiros", "bolsas", newItems);
                  }}
                />
                <Input
                  placeholder="Custo Unitário (R$)"
                  type="number"
                  step="0.01"
                  value={item.custo_unitario || ""}
                  onChange={(e) => {
                    const newItems = [...(data.recursos_financeiros.bolsas || [])];
                    const custoUnitario = e.target.value ? parseFloat(e.target.value) : 0;
                    newItems[index] = {
                      ...newItems[index],
                      custo_unitario: custoUnitario,
                      custo_total: (newItems[index].quantidade || 0) * custoUnitario,
                    };
                    updateNestedField("recursos_financeiros", "bolsas", newItems);
                  }}
                />
                <Input
                  placeholder="Custo Total (R$)"
                  type="number"
                  value={item.custo_total || ""}
                  disabled
                  className="bg-gray-100"
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newItems = [
                ...(data.recursos_financeiros.bolsas || []),
                {
                  modalidade: "",
                  justificativa: "",
                  unidade: "",
                  quantidade: 0,
                  custo_unitario: 0,
                  custo_total: 0,
                },
              ];
              updateNestedField("recursos_financeiros", "bolsas", newItems);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Bolsa
          </Button>
        </div>
      </section>
    </div>
  );
}


