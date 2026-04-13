import { useEffect } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import AIHumanSection from "@/components/AIHumanSection";
import IntelligentPanel from "@/components/IntelligentPanel";

/** Landing com scroll até a seção de planos (útil para usuários logados vindo do dashboard). */
export default function Planos() {
  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "") || "planos";
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

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
