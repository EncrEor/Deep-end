/**
 * JuiceFamilies.js
 * ----------------
 * Mappe les abréviations de jus ("mj", "f", "red", "cl"...)
 * vers un objet { familyCode, label }, ex: { familyCode: "M", label: "Mojito" }
 * 
 * Ensuite, pour obtenir l'ID final (ex: M1L, M25CL, M1LS), 
 * on assemblera "familyCode + format + (S si surgelé)".
 */

module.exports = {
    // abréviation => { familyCode, label }
    mj:  { familyCode: "M", label: "Mojito" },
    m:   { familyCode: "M", label: "Mojito" },
    f:   { familyCode: "F", label: "Fraise" },
    fr:  { familyCode: "F", label: "Fraise" },
    red: { familyCode: "R", label: "Red Citrus" },
    c:   { familyCode: "C", label: "Citron" },
    cl:  { familyCode: "CL", label: "Cool" },
    mg:  { familyCode: "MG", label: "Mangue" },
    as:  { familyCode: "AS", label: "Ananas" },
    kw:  { familyCode: "KW", label: "Kiwi" },
    y:   { familyCode: "Y", label: "Youppi" },
    ss:  { familyCode: "SS", label: "Sunshine" },
    pl:  { familyCode: "PL", label: "Peach Love" },
    gw:  { familyCode: "GW", label: "Green Wave" }
  };