import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { type CNPqFormData } from "@/lib/cnpqFormFields";
import TextFieldWithAI from "./TextFieldWithAI";

interface FormularioCNPqProps {
  data: CNPqFormData;
  onChange: (data: CNPqFormData) => void;
  editalId: string;
}

export default function FormularioCNPq({ data, onChange, editalId }: FormularioCNPqProps) {
  const updateField = <K extends keyof CNPqFormData>(
    field: K,
    value: CNPqFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  const updateNestedField = <K extends keyof CNPqFormData>(
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

  const getRemainingChars = (text: string, max: number) => {
    return max - text.length;
  };

  return (
    <div className="space-y-8">
      {/* Projeto de Pesquisa */}
      <section id="secao-projeto-pesquisa" className="space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
          Projeto de Pesquisa
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <Label htmlFor="instituicao_desenvolvimento" className="text-sm font-medium text-gray-700">
              Instituição onde será desenvolvido o projeto: <span className="text-red-500">*</span>
            </Label>
            <Input
              id="instituicao_desenvolvimento"
              value={data.projeto_pesquisa.instituicao_desenvolvimento}
              onChange={(e) => updateNestedField('projeto_pesquisa', 'instituicao_desenvolvimento', e.target.value)}
              className="mt-1"
              placeholder="Nome da instituição"
            />
          </div>

          <div>
            <Label htmlFor="titulo_projeto_pt" className="text-sm font-medium text-gray-700">
              Título do Projeto (Em Português): <span className="text-red-500">*</span>
            </Label>
            <Input
              id="titulo_projeto_pt"
              value={data.projeto_pesquisa.titulo_projeto_pt}
              onChange={(e) => updateNestedField('projeto_pesquisa', 'titulo_projeto_pt', e.target.value)}
              className="mt-1"
              placeholder="Título em português"
            />
          </div>

          <div>
            <Label htmlFor="titulo_projeto_en" className="text-sm font-medium text-gray-700">
              Título do Projeto (Em Inglês): <span className="text-red-500">*</span>
            </Label>
            <Input
              id="titulo_projeto_en"
              value={data.projeto_pesquisa.titulo_projeto_en}
              onChange={(e) => updateNestedField('projeto_pesquisa', 'titulo_projeto_en', e.target.value)}
              className="mt-1"
              placeholder="Title in English"
            />
          </div>

          <div>
            <Label htmlFor="area" className="text-sm font-medium text-gray-700">
              Área: <span className="text-red-500">*</span>
            </Label>
            <Input
              id="area"
              value={data.projeto_pesquisa.area}
              onChange={(e) => updateNestedField('projeto_pesquisa', 'area', e.target.value)}
              className="mt-1"
              placeholder="Área de conhecimento"
            />
          </div>

          <div>
            <Label htmlFor="palavras_chave_pt" className="text-sm font-medium text-gray-700">
              Palavras-chave (em português): <span className="text-red-500">*</span>
            </Label>
            <Input
              id="palavras_chave_pt"
              value={data.projeto_pesquisa.palavras_chave_pt}
              onChange={(e) => updateNestedField('projeto_pesquisa', 'palavras_chave_pt', e.target.value)}
              className="mt-1"
              placeholder="Informe entre uma e seis palavras-chave, separadas por vírgula"
            />
            <p className="text-xs text-gray-500 mt-1">
              Informe entre uma e seis palavras-chave, separadas por vírgula
            </p>
          </div>

          <div>
            <Label htmlFor="palavras_chave_en" className="text-sm font-medium text-gray-700">
              Palavras-chave (em inglês): <span className="text-red-500">*</span>
            </Label>
            <Input
              id="palavras_chave_en"
              value={data.projeto_pesquisa.palavras_chave_en}
              onChange={(e) => updateNestedField('projeto_pesquisa', 'palavras_chave_en', e.target.value)}
              className="mt-1"
              placeholder="Informe entre uma e seis palavras-chave, separadas por vírgula"
            />
            <p className="text-xs text-gray-500 mt-1">
              Informe entre uma e seis palavras-chave, separadas por vírgula
            </p>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Todos os campos são de preenchimento obrigatório para o envio ao CNPq.</strong>
          </p>
        </div>
      </section>

      {/* Resumo */}
      <section id="secao-resumo" className="space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
          Resumo
        </h3>

        <div>
          <Label htmlFor="resumo_proposta" className="text-sm font-medium text-gray-700">
            Resumo da Proposta <span className="text-red-500">*</span>
          </Label>
          <TextFieldWithAI
            id="resumo_proposta"
            value={data.resumo.resumo_proposta}
            onChange={(value) => updateNestedField('resumo', 'resumo_proposta', value)}
            editalId={editalId}
            fieldName="resumo_proposta"
            maxLength={2000}
            className="mt-1"
            placeholder="Digite o resumo da proposta"
          />
          <div className="mt-1 flex justify-between">
            <p className="text-xs text-gray-500">Texto limitado a 2000 caracteres</p>
            <p className={`text-xs ${getRemainingChars(data.resumo.resumo_proposta, 2000) < 100 ? 'text-red-500' : 'text-gray-500'}`}>
              {getRemainingChars(data.resumo.resumo_proposta, 2000)} caracteres restantes
            </p>
          </div>
        </div>
      </section>

      {/* Sobre o Projeto */}
      <section id="secao-sobre-projeto" className="space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
          Sobre o Projeto
        </h3>

        {[
          { key: 'objetivo', label: '1. Com relação ao projeto proposto, descreva seus objetivos.', number: 1 },
          { key: 'metas', label: '2. Com relação ao projeto proposto, descreva suas metas.', number: 2 },
          { key: 'metodologia_gestao_execucao', label: '3. Com relação ao projeto proposto, descreva metodologia e gestão da execução.', number: 3 },
          { key: 'relevancia_setor_produtivo', label: '4. Com relação ao projeto proposto, descreva sua relevância para o setor produtivo.', number: 4 },
          { key: 'instituicoes_colaboradoras_financiadoras', label: '5. Informe se há instituições colaboradoras, empresas financiadoras ou financiamento anterior de algum órgão de fomento.', number: 5 },
          { key: 'nivel_maturidade_tecnologica', label: '6. Informe o nível de maturidade tecnológica do atual projeto.', number: 6 },
          { key: 'resultados_cientificos_tecnologicos', label: '7. Informe os resultados científicos e tecnológicos já alcançados com o projeto.', number: 7 },
          { key: 'potencial_producao_tecnologica_inovacao', label: '8. Informe o potencial do projeto para produção tecnológica e de inovação.', number: 8 },
          { key: 'potencial_empreendedorismo_inovador', label: '9. Informe o potencial do projeto para ações de empreendedorismo inovador.', number: 9 },
          { key: 'potencial_atendimento_necessidades', label: '10. Informe o potencial do projeto para atendimento a necessidades de criação e/ou melhoria de produtos, processos e/ou serviços, demandadas por instituições no ambiente produtivo ou social (vide item 6.6.1 da Chamada Pública).', number: 10 },
          { key: 'sumula_curricular', label: '11. SÚMULA CURRICULAR: destacar e justificar até 5 (cinco) das suas realizações acadêmicas de maior impacto e relevância, atendendo o que foi solicitado pelo Comitê Assessor que avaliará o seu projeto, nos termos do item 6.5 e do Anexo I da Chamada Pública.', number: 11 },
          { key: 'sumula_curricular_continuacao', label: '12. SÚMULA CURRICULAR (continuação)', number: 12 },
        ].map(({ key, label, number }) => (
          <div key={key} id={`secao-${key}`} className="space-y-2 mt-8">
            <Label htmlFor={key} className="text-sm font-medium text-gray-700">
              {label}
            </Label>
            <TextFieldWithAI
              id={key}
              value={data.sobre_projeto[key as keyof typeof data.sobre_projeto]}
              onChange={(value) => updateNestedField('sobre_projeto', key, value)}
              editalId={editalId}
              fieldName={key}
              maxLength={4000}
              className="mt-1 min-h-[150px]"
              placeholder={`Digite a resposta para a questão ${number}`}
            />
            <div className="flex justify-between">
              <p className="text-xs text-gray-500">Texto limitado a 4000 caracteres</p>
              <p className={`text-xs ${getRemainingChars(data.sobre_projeto[key as keyof typeof data.sobre_projeto] as string, 4000) < 200 ? 'text-red-500' : 'text-gray-500'}`}>
                {getRemainingChars(data.sobre_projeto[key as keyof typeof data.sobre_projeto] as string, 4000)} caracteres restantes
              </p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

