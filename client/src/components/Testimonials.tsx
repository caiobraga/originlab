import { Card } from "@/components/ui/card";
import { Quote } from "lucide-react";
import ScrollReveal from "@/components/ScrollReveal";

const testimonials = [
  {
    name: "Dr. Ana Silva",
    role: "Pesquisadora - USP",
    content: "A Origem.Lab transformou completamente minha forma de buscar fomento. Em 2 meses, consegui aprovação em 3 editais que nem sabia que existiam!",
    avatar: "AS"
  },
  {
    name: "Carlos Mendes",
    role: "CEO - TechStart",
    content: "Economizamos mais de 40 horas por mês em busca e elaboração de propostas. A IA redatora é impressionante e o acompanhamento é impecável.",
    avatar: "CM"
  },
  {
    name: "Mariana Costa",
    role: "Coordenadora de Inovação - FAPESP",
    content: "Como instituição de fomento, vemos a qualidade das propostas melhorar significativamente. A Origem.Lab está democratizando o acesso à inovação.",
    avatar: "MC"
  }
];

export default function Testimonials() {
  return (
    <section id="depoimentos" className="py-24 bg-gray-50">
      <div className="container">
        <ScrollReveal className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
            O que dizem nossos usuários
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Histórias reais de quem transformou ideias em projetos financiados
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <ScrollReveal key={index} delay={0.06 * index}>
              <Card className="p-8 border border-gray-200 hover:shadow-md transition-shadow relative">
              <Quote className="absolute top-6 right-6 w-12 h-12 text-gray-200" />
              
              <div className="relative z-10">
                <p className="text-gray-700 mb-6 leading-relaxed italic">
                  "{testimonial.content}"
                </p>

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gray-950 flex items-center justify-center text-white font-bold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{testimonial.name}</div>
                    <div className="text-sm text-gray-600">{testimonial.role}</div>
                  </div>
                </div>
              </div>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
