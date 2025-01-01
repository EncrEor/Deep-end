const ClientsService = require('./ClientsService');
const ProductsService = require('./ProductsService');
const AbbreviationsService = require('./AbbreviationsService');
const JuiceFamilies = require('./JuiceFamilies');

class MessageParser {
  constructor() {}

  async parseMessage(message) {
    console.log('🔹[MessageParser] parseMessage -> message:', message);
    const lines = message
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    let currentClient = null;
    let currentProducts = [];
    let isFrozen = false;
    let currentFormat = "1L";
    let isReturnOrder = false;
    let orders = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i < lines.length - 1 ? lines[i + 1] : null;

      // Check for RETOUR keyword
      if (this.isRetourLine(line)) {
        if (currentClient && currentProducts.length > 0) {
          orders.push(this.createOrder(currentClient, currentProducts, isReturnOrder));
          currentProducts = [];
        }
        isReturnOrder = true;
        continue;
      }

      // Check for format changes
      if (this.isFormatLine(line)) {
        currentFormat = this.parseFormat(line);
        continue;
      }

      // Check for surgelé
      if (this.isSurgeleLine(line)) {
        isFrozen = true;
        continue;
      }

      // Try to resolve as client
      const maybeClient = AbbreviationsService.resolveFullClientData(line);
      if (maybeClient) {
        if (currentClient && currentProducts.length > 0) {
          orders.push(this.createOrder(currentClient, currentProducts, isReturnOrder));
        }
        currentClient = maybeClient;
        currentProducts = [];
        currentFormat = this.formatFromDefault(maybeClient.defaultFormat);
        isFrozen = false;
        isReturnOrder = false;
        continue;
      }

      // Handle standard number block patterns
      if (this.isNumbersLine(line)) {
        const nums = line.split(/\s+/).map(n => parseInt(n, 10));
        
        if (currentFormat === "5L") {
          // Format 5L: toujours [F, C]
          const products5L = this.parseDefaultBlock(nums, "5L", isFrozen, ["F", "C"]);
          currentProducts.push(...products5L);
        } else if (nextLine && this.isNumbersLine(nextLine)) {
          // Pattern double ligne: 1L suivi de 25CL
          const products1L = this.parseDefaultBlock(nums, "1L", isFrozen);
          currentProducts.push(...products1L);
          
          const nums25CL = nextLine.split(/\s+/).map(n => parseInt(n, 10));
          const products25CL = this.parseDefaultBlock(nums25CL, "25CL", isFrozen);
          currentProducts.push(...products25CL);
          i++; // Skip next line
        } else {
          // Ligne simple avec potentiel 5ème produit
          const standardProducts = this.parseDefaultBlock(nums.slice(0, 4), currentFormat, isFrozen);
          currentProducts.push(...standardProducts);
          
          if (nums.length > 4 && nextLine) {
            const extraProduct = this.parseExtraProduct(nums[4], nextLine, currentFormat, isFrozen);
            if (extraProduct) {
              currentProducts.push(extraProduct);
              i++; // Skip product name line
            }
          }
        }
        continue;
      }

      // Handle "quantity product format" pattern
      if (this.isQuantityProductLine(line)) {
        const product = this.parseQuantityProductLine(line, isFrozen);
        if (product) {
          currentProducts.push(product);
        }
      }
    }

    // Add final order if exists
    if (currentClient && currentProducts.length > 0) {
      orders.push(this.createOrder(currentClient, currentProducts, isReturnOrder));
    }

    return orders.length > 0 ? orders : null;
  }

  createOrder(client, products, isReturn) {
    return {
      client,
      products,
      type: isReturn ? 'return' : 'delivery'
    };
  }

  isRetourLine(line) {
    return line.toLowerCase().includes('retour');
  }

  isSurgeleLine(line) {
    const normalized = line.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalized.includes('surgele') || normalized.includes('surgeles');
  }

  isFormatLine(line) {
    const normalized = line.toLowerCase();
    return normalized.includes('5l') || normalized.includes('25cl') || normalized.includes('3l');
  }

  parseFormat(line) {
    const normalized = line.toLowerCase();
    if (normalized.includes('5l')) return "5L";
    if (normalized.includes('25cl')) return "25CL";
    if (normalized.includes('3l')) return "3L";
    return "1L";
  }

  isNumbersLine(line) {
    if (!line) return false;
    const tokens = line.split(/\s+/);
    return tokens.length > 0 && tokens.every(token => !isNaN(parseInt(token, 10)));
  }

  isQuantityProductLine(line) {
    const parts = line.split(/\s+/);
    return parts.length >= 2 && !isNaN(parseInt(parts[0], 10));
  }

  parseQuantityProductLine(line, isFrozen) {
    const parts = line.split(/\s+/);
    const quantity = parseInt(parts[0], 10);
    if (isNaN(quantity)) return null;

    let format = "1L";
    let productAbrev = parts[1];

    // Check for format in the line
    const formatMatch = line.match(/\d+L|\d+CL/i);
    if (formatMatch) {
      format = formatMatch[0].toUpperCase();
    }

    const familyCode = this.getJuiceFamily(productAbrev);
    if (!familyCode) return null;

    return {
      productId: this.buildProductId(familyCode, format, isFrozen),
      quantity
    };
  }

  parseDefaultBlock(nums, format, isFrozen, customFamilies = null) {
    const families = customFamilies || ["C", "M", "F", "R"];
    const products = [];
    
    for (let i = 0; i < Math.min(nums.length, families.length); i++) {
      const quantity = nums[i] || 0;
      if (quantity > 0) {
        const productId = this.buildProductId(families[i], format, isFrozen);
        products.push({
          productId,
          quantity
        });
      }
    }
    
    return products;
  }

  parseExtraProduct(quantity, productLine, format, isFrozen) {
    if (quantity <= 0 || !productLine) return null;
    
    const abrev = productLine.trim().split(/\s+/)[0];
    const familyCode = this.getJuiceFamily(abrev);
    if (!familyCode) return null;

    return {
      productId: this.buildProductId(familyCode, format, isFrozen),
      quantity
    };
  }

  formatFromDefault(defaultFormat) {
    if (defaultFormat === "25") return "25CL";
    if (defaultFormat === "5") return "5L";
    return "1L";
  }

  getJuiceFamily(abrev) {
    if (!abrev) return undefined;
    const normalized = abrev.toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const entry = JuiceFamilies[normalized] || JuiceFamilies[abrev.toLowerCase().trim()];
    return entry ? entry.familyCode : undefined;
  }

  buildProductId(familyCode, format, isFrozen) {
    // Nettoyer le format
    let cleanFormat = format.toUpperCase().replace(/\s+/g, '');
    if (!cleanFormat.includes('L') && !cleanFormat.includes('CL')) {
      cleanFormat += 'L';
    }
    
    let id = familyCode + cleanFormat;
    if (isFrozen) id += "S";
    return id;
  }
}

module.exports = new MessageParser();