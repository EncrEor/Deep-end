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
    let explicitFormat = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i < lines.length - 1 ? lines[i + 1] : null;

      if (this.isRetourLine(line)) {
        if (currentClient && currentProducts.length > 0) {
          orders.push(this.createOrder(currentClient, currentProducts, isReturnOrder));
          currentProducts = [];
        }
        isReturnOrder = true;
        continue;
      }

      if (this.isFormatLine(line)) {
        currentFormat = this.parseFormat(line);
        continue;
      }

      if (this.isSurgeleLine(line)) {
        isFrozen = true;
        continue;
      }

      const maybeClient = await AbbreviationsService.resolveFullClientData(line);
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

      if (this.isNumbersLine(line)) {
        const parts = line.split(/\s+/);
        const nums = [];
        let extraProduct = null;

        for (let j = 0; j < parts.length; j++) {
          const part = parts[j];
          const match = part.match(/^(\d+)([a-zA-Z]+)$/);
          if (match) {
            const [_, quantity, abrev] = match;
            const familyCode = this.getJuiceFamily(abrev);
            if (familyCode) {
              extraProduct = {
                productId: this.buildProductId(familyCode, currentFormat, isFrozen),
                quantity: parseInt(quantity)
              };
            }
          } else {
            const num = parseInt(part, 10);
            if (!isNaN(num)) nums.push(num);
          }
        }

        if (currentFormat === "5L") {
          const products5L = this.parseDefaultBlock(nums, "5L", isFrozen, ["F", "C"]);
          currentProducts.push(...products5L);
        } else if (nextLine && this.isNumbersLine(nextLine)) {
          const products1L = this.parseDefaultBlock(nums.slice(0, 4), "1L", isFrozen);
          currentProducts.push(...products1L);
          if (extraProduct) currentProducts.push(extraProduct);

          const parts25CL = nextLine.split(/\s+/);
          const nums25CL = [];
          let extra25CL = null;

          for (const part of parts25CL) {
            const match = part.match(/^(\d+)([a-zA-Z]+)$/);
            if (match) {
              const [_, quantity, abrev] = match;
              const familyCode = this.getJuiceFamily(abrev);
              if (familyCode) {
                extra25CL = {
                  productId: this.buildProductId(familyCode, "25CL", isFrozen),
                  quantity: parseInt(quantity)
                };
              }
            } else {
              const num = parseInt(part, 10);
              if (!isNaN(num)) nums25CL.push(num);
            }
          }

          const products25CL = this.parseDefaultBlock(nums25CL.slice(0, 4), "25CL", isFrozen);
          currentProducts.push(...products25CL);
          if (extra25CL) currentProducts.push(extra25CL);
          i++;
        } else {
          const standardProducts = this.parseDefaultBlock(nums.slice(0, 4), currentFormat, isFrozen);
          currentProducts.push(...standardProducts);
          if (extraProduct) currentProducts.push(extraProduct);
        }
        continue;
      }

      if (this.isQuantityProductLine(line)) {
        const product = this.parseQuantityProductLine(line, isFrozen);
        if (product) currentProducts.push(product);
      }
    }

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
    const parts = line.split(/\s+/);
    return parts.some(part => {
      const num = parseInt(part, 10);
      return !isNaN(num) || part.match(/^\d+[a-zA-Z]+$/);
    });
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

    const formatMatch = line.match(/\d+L|\d+CL/i);
    if (formatMatch) format = formatMatch[0].toUpperCase();

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