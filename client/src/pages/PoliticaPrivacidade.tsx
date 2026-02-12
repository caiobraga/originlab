import Header from "@/components/Header";
import { APP_TITLE } from "@/const";

export default function PoliticaPrivacidade() {
  return (
    <div className="flex-1 min-h-screen flex flex-col">
      <Header />
      <main className="container py-12 max-w-3xl prose prose-gray">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Política de Privacidade</h1>
        <p className="text-sm text-gray-500 mb-8">Última atualização: fevereiro de 2025</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Introdução</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            A {APP_TITLE} (&quot;nós&quot;, &quot;nosso&quot;) está comprometida com a proteção da sua privacidade. 
            Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos suas informações 
            pessoais quando você utiliza nossa plataforma e serviços.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Dados que coletamos</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Podemos coletar: (a) dados cadastrais (nome, email, telefone); (b) dados de currículo e perfil 
            profissional; (c) dados de uso da plataforma (ações, preferências, histórico de editais); (d) 
            dados técnicos (endereço IP, tipo de navegador, dispositivo). Dados sensíveis como CPF são 
            tratados apenas quando necessários e com seu consentimento.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Finalidade do tratamento</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Utilizamos seus dados para: prestar e melhorar nossos serviços; identificar editais 
            compatíveis com seu perfil; processar pagamentos; enviar comunicações sobre o serviço; 
            cumprir obrigações legais; e garantir a segurança da plataforma.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Base legal (LGPD)</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            O tratamento de dados pessoais está fundamentado em: execução de contrato, consentimento, 
            legítimo interesse e cumprimento de obrigação legal, conforme aplicável.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Compartilhamento</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Não vendemos seus dados. Podemos compartilhar dados com prestadores de serviços (hospedagem, 
            autenticação, pagamento) e autoridades quando exigido por lei.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Seus direitos</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            De acordo com a LGPD, você tem direito a: acesso, correção, exclusão, portabilidade, 
            revogação do consentimento e oposição. Para exercer seus direitos, entre em contato 
            em <a href="mailto:contato@origemlab.ai" className="text-blue-600 hover:underline">contato@origemlab.ai</a>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Retenção e segurança</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Mantemos os dados pelo tempo necessário à prestação do serviço e obrigações legais. 
            Adotamos medidas técnicas e organizacionais para proteger seus dados contra acesso 
            não autorizado, alteração ou destruição.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Contato</h2>
          <p className="text-gray-600 leading-relaxed">
            Para dúvidas sobre esta política: <a href="mailto:contato@origemlab.ai" className="text-blue-600 hover:underline">contato@origemlab.ai</a>.
          </p>
        </section>
      </main>
    </div>
  );
}
