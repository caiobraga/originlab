import { Link, useLocation } from "wouter";
import { 
  ArrowLeft, Search, Filter, Globe, TrendingUp, Calendar, 
  DollarSign, Target, CheckCircle2, Clock, AlertCircle,
  Download, Send, Eye, Sparkles, BarChart3, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Edital {
  id: string;
  titulo: string;
  orgao: string;
  valor: string;
  prazo: string;
  match: number;
  probabilidade: number;
  pais: string;
  flag: string;
  area: string;
  status: "novo" | "em_analise" | "submetido";
  elegivel: boolean;
  requisitos?: string[];
}

const editaisGlobais: Edital[] = [
  {
    id: "1",
    titulo: "Horizon Europe - EIC Accelerator 2025",
    orgao: "European Innovation Council",
    valor: "€2.500.000",
    prazo: "45 dias",
    match: 96,
    probabilidade: 78,
    pais: "União Europeia",
    flag: "🇪🇺",
    area: "Tecnologia",
    status: "novo",
    elegivel: true,
    requisitos: ["Parceiro europeu necessário", "TRL 6-8", "Potencial de escala global"]
  },
  {
    id: "2",
    titulo: "FAPESP - Pesquisa Inovativa em Pequenas Empresas (PIPE)",
    orgao: "FAPESP",
    valor: "R$ 1.000.000",
    prazo: "30 dias",
    match: 94,