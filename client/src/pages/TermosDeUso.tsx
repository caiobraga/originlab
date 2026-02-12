import Header from "@/components/Header";
import { Link } from "wouter";
import { APP_TITLE } from "@/const";

export default function TermosDeUso() {
  return (
    <div className="flex-1 min-h-screen flex flex-col">
      <Header />
      <main className="container py-12 max-w-3xl prose prose-gray">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Termos de Uso</h1>
        <p className="text-sm text-gray-500 mb-8">Última atualização: fevereiro de 2025</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Aceitação dos termos</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Ao acessar ou utilizar a plataforma {APP_TITLE}, você concorda com estes Termos de Uso. 
            Se não concordar, não utilize nossos serviços.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Descrição do serviço</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            A {APP_TITLE} oferece uma plataforma de inteligência artificial para conexão entre 
            projetos e oportunidades de fomento (editais, chamadas públicas e programas de incentivo), 
            incluindo busca, análise de aderência e auxílio na elaboração de propostas.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Cadastro e responsabilidade</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            O usuário é responsável pela veracidade dos dados cadastrais e pelo uso adequado da 
            plataforma. A conta é pessoal e intransferível. Você não deve compartilhar credenciais 
            nem utilizar o serviço para fins ilícitos.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Propriedade intelectual</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            O conteúdo da plataforma (código, design, marca) é de propriedade da {APP_TITLE} ou de 
            licenciadores. O usuário mantém a propriedade dos dados e conteúdos que insere, 
            concedendo-nos licença para utilizá-los na prestação do serviço.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Limitação de responsabilidade</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            A plataforma fornece informações e sugestões com base em algoritmos. Não garantimos 
            aprovação em editais nem assumimos responsabilidade por decisões de órgãos financiadores. 
            O usuário é responsável por validar prazos, requisitos e submissões finais.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Pagamento e planos</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Planos pagos estão sujeitos aos preços e condições vigentes no momento da contratação. 
            Políticas de cancelamento e reembolso podem ser consultadas em nossa página de planos.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Suspensão e rescisão</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Podemos suspender ou encerrar o acesso em caso de violação destes termos ou de uso 
            inadequado. O usuário pode encerrar sua conta a qualquer momento.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Alterações</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Podemos alterar estes Termos periodicamente. Alterações relevantes serão comunicadas 
            por email ou na plataforma. O uso continuado após a publicação constitui aceitação.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Contato</h2>
          <p className="text-gray-600 leading-relaxed">
            Dúvidas: <a href="mailto:contato@origemlab.ai" className="text-blue-600 hover:underline">contato@origemlab.ai</a>. 
            Consulte também nossa{" "}
            <Link href="/politica-privacidade" className="text-blue-600 hover:underline">
              Política de Privacidade
            </Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
