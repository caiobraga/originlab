import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import AIHumanSection from "@/components/AIHumanSection";
import IntelligentPanel from "@/components/IntelligentPanel";

/** Página inicial/landing sempre visível (sem redirecionar logados para o dashboard). Usada pelo logo. */
export default function Inicio() {
  return (
    <div className="flex-1">
      <Header />
      <main id="main-content">
        <Hero />
        <HowItWorks />
        <AIHumanSection />
        <IntelligentPanel />
        <Pricing />
        <Testimonials />
      </main>
      <Footer />
    </div>
  );
}
