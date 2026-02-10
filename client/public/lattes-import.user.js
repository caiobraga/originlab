// ==UserScript==
// @name         OrigemLab - Importar currículo Lattes
// @namespace    https://originlab.com.br
// @version      1.1
// @description  Extrai dados do currículo Lattes e envia para o OrigemLab; fecha a janela após enviar.
// @author       OrigemLab
// @match        http://lattes.cnpq.br/*
// @match        https://lattes.cnpq.br/*
// @match        http://buscatextual.cnpq.br/*
// @match        https://buscatextual.cnpq.br/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  var alreadySent = false;

  function isCaptchaPage() {
    if (!document.body) return true;
    const text = document.body.innerText || "";
    return /c[oó]digo de seguran[cç]a|captcha|verifique que voc[eê] n[aã]o e um rob[oô]/i.test(text);
  }

  function getText(el) {
    return el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function extractNome() {
    var h2 = document.querySelector("h2");
    if (h2) {
      var t = getText(h2);
      if (t && t.length < 100 && !/seguran[cç]a|captcha|c[oó]digo/i.test(t)) return t;
    }
    var h1 = document.querySelector("h1");
    if (h1) {
      var t1 = getText(h1);
      if (t1 && t1.length > 2 && t1.length < 100 && !/captcha|seguran|c[oó]digo|curr[ií]culo\s*lattes/i.test(t1)) return t1;
    }
    var titles = document.querySelectorAll("[class*='nome'], [id*='nome'], .nome-completo");
    for (var i = 0; i < titles.length; i++) {
      var t = getText(titles[i]);
      if (t && t.length > 3 && t.length < 100) return t;
    }
    var tables = document.querySelectorAll("table");
    for (var ti = 0; ti < tables.length; ti++) {
      var cells = tables[ti].querySelectorAll("td");
      for (var ci = 0; ci < cells.length; ci++) {
        var t = getText(cells[ci]);
        if (t && t.length > 5 && t.length < 80 && /[A-Za-zÀ-ÿ]/.test(t) && !/^\d+$/.test(t) && !/seguran|captcha|px|padding/i.test(t)) return t;
      }
    }
    var bodyText = document.body.innerText || "";
    if (bodyText.length > 200 && !isCaptchaPage()) return "Pesquisador (Lattes)";
    return null;
  }

  function extractAreas() {
    var areas = [];
    var text = document.body ? document.body.innerText : "";
    var areaMatch = text.match(/(?:Grande\s+[Aa]rea|[\u00c1\u00e1]rea|Sub[\u00e1a]rea|Especialidade)[^:\n]*:\s*([^\n]+)/gi);
    if (areaMatch) {
      for (var i = 0; i < areaMatch.length; i++) {
        var part = areaMatch[i].replace(/(?:Grande\s+[Aa]rea|[\u00c1\u00e1]rea|Sub[\u00e1a]rea|Especialidade)[^:]*:\s*/i, "").trim();
        if (part.length > 2 && part.length < 150 && areas.indexOf(part) === -1 && !/px|padding|margin|style/i.test(part)) areas.push(part);
      }
    }
    return areas.length ? areas.slice(0, 15) : undefined;
  }

  function extractFormacao() {
    var formacao = [];
    var text = document.body ? document.body.innerText : "";
    var hasDoutorado = /doutorado|doutor\b|ph\.?\s*d\.?/i.test(text);
    var hasMestrado = /mestrado|master\b/i.test(text);
    var hasGraduacao = /gradua[cç][aã]o|bacharelado|licenciatura/i.test(text);
    var tables = document.querySelectorAll("table");
    for (var ti = 0; ti < tables.length; ti++) {
      var rows = tables[ti].querySelectorAll("tr");
      for (var ri = 0; ri < rows.length; ri++) {
        var cells = rows[ri].querySelectorAll("td");
        var first = getText(cells[0]);
        var second = getText(cells[1]);
        if (/doutorado|mestrado|gradua|cursos/i.test(first + second)) {
          formacao.push({
            nivel: first && first.length < 50 ? first : (hasDoutorado ? "Doutorado" : hasMestrado ? "Mestrado" : "Graduação"),
            curso: second || "—",
            instituicao: getText(cells[2]) || "—",
            anoConclusao: getText(cells[3]) || undefined
          });
        }
      }
    }
    if (formacao.length === 0 && (hasDoutorado || hasMestrado || hasGraduacao)) {
      if (hasDoutorado) formacao.push({ nivel: "Doutorado", curso: "—", instituicao: "Lattes", anoConclusao: undefined });
      if (hasMestrado) formacao.push({ nivel: "Mestrado", curso: "—", instituicao: "Lattes", anoConclusao: undefined });
      if (hasGraduacao) formacao.push({ nivel: "Graduação", curso: "—", instituicao: "Lattes", anoConclusao: undefined });
    }
    return formacao.length ? formacao : undefined;
  }

  function extractVinculos() {
    var vinculos = [];
    var text = document.body ? document.body.innerText : "";
    var vinculoMatch = text.match(/(?:Institui[cç][aã]o|\u00d3rg[aã]o|Empresa|V[ií]nculo)[^:]*:\s*([^\n]+)/gi);
    if (vinculoMatch) {
      for (var i = 0; i < Math.min(5, vinculoMatch.length); i++) {
        var v = vinculoMatch[i].replace(/(?:Institui[cç][aã]o|\u00d3rg[aã]o|Empresa|V[ií]nculo)[^:]*:\s*/i, "").trim();
        if (v.length > 3 && v.length < 200 && vinculos.indexOf(v) === -1) vinculos.push(v);
      }
    }
    return vinculos.length ? vinculos : undefined;
  }

  function run() {
    if (alreadySent || !window.opener) return;
    if (isCaptchaPage()) return;
    var nome = extractNome();
    if (!nome) return;
    alreadySent = true;
    var areasAtuacao = extractAreas();
    var formacao = extractFormacao();
    var vinculoInstitucional = extractVinculos();
    var bodyText = document.body ? document.body.innerText : "";
    var possuiDoutorado = /doutorado|doutor\b|ph\.?\s*d\.?/i.test(bodyText);
    var possuiMestrado = /mestrado|master\b/i.test(bodyText);
    var possuiGraduacao = /gradua[cç][aã]o|bacharelado|licenciatura/i.test(bodyText);
    try {
      window.opener.postMessage(
        {
          type: "ORIGEMLAB_LATTES_IMPORT",
          data: {
            nome: nome,
            resumo: "Importado da janela do Lattes (após resolver o captcha).",
            areasAtuacao: areasAtuacao,
            formacao: formacao,
            vinculoInstitucional: vinculoInstitucional,
            elegibilidade: {
              possuiDoutorado: possuiDoutorado,
              possuiMestrado: possuiMestrado,
              possuiGraduacao: possuiGraduacao,
              podeParticiparEditais: possuiDoutorado || possuiMestrado || possuiGraduacao
            }
          }
        },
        "*"
      );
      try { window.close(); } catch (e) {}
    } catch (err) {}
  }

  function addButton() {
    if (document.getElementById("origemlab-lattes-btn") || isCaptchaPage() || !window.opener) return;
    var btn = document.createElement("button");
    btn.id = "origemlab-lattes-btn";
    btn.textContent = "Enviar para OrigemLab";
    btn.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:99999;padding:10px 16px;background:#4f46e5;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2);";
    btn.onmouseover = function () { btn.style.background = "#4338ca"; };
    btn.onmouseout = function () { btn.style.background = "#4f46e5"; };
    btn.onclick = function () { run(); btn.textContent = "Enviado! Fechando..."; setTimeout(function () { try { window.close(); } catch (e) {} }, 500); };
    document.body.appendChild(btn);
  }

  function poll() {
    if (alreadySent) return;
    if (!window.opener) return;
    if (isCaptchaPage()) return;
    run();
  }

  function schedulePoll() {
    var attempts = 0;
    var maxAttempts = 20;
    var iv = setInterval(function () {
      attempts++;
      poll();
      if (alreadySent || attempts >= maxAttempts) clearInterval(iv);
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(poll, 1500);
      setTimeout(poll, 4000);
      schedulePoll();
      setTimeout(addButton, 3000);
    });
  } else {
    setTimeout(poll, 1500);
    setTimeout(poll, 4000);
    schedulePoll();
    setTimeout(addButton, 3000);
  }
})();
