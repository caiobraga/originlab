import { useState, useEffect, useRef } from "react";
import { Send, Loader2, Bot, User, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  ChatMessage,
  sendChatMessage,
  saveChatHistory,
  loadChatHistory,
} from "@/lib/editalChat";
import { toast } from "sonner";

interface EditalChatProps {
  editalId: string;
}

export default function EditalChat({ editalId }: EditalChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history on mount
  useEffect(() => {
    const history = loadChatHistory(editalId);
    setMessages(history);
  }, [editalId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    if (!user) {
      toast.error("Você precisa estar logado para usar o chat");
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    // Add user message immediately
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      // Send message to webhook
      const response = await sendChatMessage(
        userMessage.content,
        editalId,
        user,
        profile,
        messages
      );

      // Add assistant response
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: new Date(),
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);

      // Save to localStorage
      saveChatHistory(editalId, updatedMessages);
    } catch (error: any) {
      console.error("Erro completo ao enviar mensagem:", error);
      console.error("Tipo do erro:", error?.constructor?.name);
      console.error("Mensagem do erro:", error?.message);
      console.error("Stack do erro:", error?.stack);
      
      // Determine error message based on error type
      let errorMessageText = "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.";
      let toastMessage = "Erro ao enviar mensagem. Tente novamente.";
      
      const errorMsg = error?.message || String(error);
      
      if (errorMsg.includes("CORS") || errorMsg.includes("conexão") || errorMsg.includes("Failed to fetch")) {
        errorMessageText = "Erro de conexão: O servidor não está permitindo requisições. Verifique as configurações de CORS no servidor n8n.";
        toastMessage = "Erro de CORS: Verifique as configurações do servidor";
      } else if (errorMsg.includes("HTTP error")) {
        errorMessageText = `Erro HTTP: ${errorMsg}`;
        toastMessage = "Erro ao comunicar com o servidor";
      } else if (errorMsg.includes("JSON") || errorMsg.includes("parse")) {
        errorMessageText = "Erro ao processar resposta do servidor. A resposta pode estar em formato inválido.";
        toastMessage = "Erro ao processar resposta";
      } else if (errorMsg.includes("timeout") || errorMsg.includes("Timeout")) {
        errorMessageText = "A requisição demorou muito para responder. Por favor, tente novamente.";
        toastMessage = "Timeout na requisição";
      } else if (errorMsg) {
        errorMessageText = `Erro: ${errorMsg}`;
      }
      
      toast.error(toastMessage);

      // Add error message
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: errorMessageText,
        timestamp: new Date(),
      };

      const updatedMessages = [...newMessages, errorMessage];
      setMessages(updatedMessages);
      saveChatHistory(editalId, updatedMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 w-14 h-14 md:w-16 md:h-16 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center z-50 hover:scale-110 active:scale-95"
        aria-label="Abrir chat"
      >
        {isOpen ? (
          <X className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <>
            <MessageCircle className="w-5 h-5 md:w-6 md:h-6" />
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold">
                {messages.length > 9 ? '9+' : messages.length}
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          
          <div className="fixed bottom-0 right-0 left-0 md:bottom-24 md:right-6 md:left-auto w-full md:w-96 h-[85vh] md:h-[600px] max-h-[700px] bg-white rounded-t-2xl md:rounded-xl border border-gray-200 shadow-2xl z-50 flex flex-col animate-in fade-in-0 zoom-in-95 duration-300 overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 p-3 md:p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-violet-50 rounded-t-2xl md:rounded-t-xl">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 md:w-5 md:h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm md:text-base text-gray-900 truncate">Assistente de Edital</h3>
                    <p className="text-xs text-gray-600 truncate">
                      Faça perguntas sobre este edital
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-gray-200 active:bg-gray-300 rounded-full transition-colors flex-shrink-0"
                  aria-label="Fechar chat"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4 min-h-0 overscroll-contain scroll-smooth">
              <div className="space-y-3 md:space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8 md:py-12">
                    <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 rounded-full bg-gradient-to-r from-blue-100 to-violet-100 flex items-center justify-center">
                      <Bot className="w-8 h-8 md:w-10 md:h-10 text-blue-600" />
                    </div>
                    <p className="text-sm md:text-base font-medium mb-2">
                      Olá! Como posso ajudá-lo?
                    </p>
                    <p className="text-xs md:text-sm text-gray-400 px-4">
                      Faça perguntas sobre requisitos, prazos, valores ou qualquer outra informação do edital.
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-2 md:gap-3 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "assistant" && (
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-r from-blue-100 to-violet-100 flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-600" />
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-3 md:px-4 py-2.5 md:py-3 shadow-sm ${
                          message.role === "user"
                            ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-br-sm"
                            : "bg-gray-50 text-gray-900 border border-gray-100 rounded-bl-sm"
                        }`}
                      >
                        <p className="text-sm md:text-base whitespace-pre-wrap break-words leading-relaxed">
                          {message.content}
                        </p>
                        <p
                          className={`text-xs mt-1.5 ${
                            message.role === "user"
                              ? "text-blue-100"
                              : "text-gray-400"
                          }`}
                        >
                          {message.timestamp.toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      {message.role === "user" && (
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-r from-gray-300 to-gray-400 flex items-center justify-center flex-shrink-0 mt-1">
                          <User className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                        </div>
                      )}
                    </div>
                  ))
                )}

                {isLoading && (
                  <div className="flex gap-2 md:gap-3 justify-start">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-r from-blue-100 to-violet-100 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-600" />
                    </div>
                    <div className="bg-gray-50 rounded-2xl rounded-bl-sm px-3 md:px-4 py-2.5 md:py-3 border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span className="text-sm text-gray-600">Pensando...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="flex-shrink-0 p-3 md:p-4 border-t border-gray-200 bg-white rounded-b-2xl md:rounded-b-xl">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite sua pergunta..."
                  disabled={isLoading}
                  className="flex-1 text-sm md:text-base border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
                <Button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white px-3 md:px-4 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  size="default"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 md:w-5 md:h-5" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

