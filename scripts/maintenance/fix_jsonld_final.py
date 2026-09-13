with open('C:/Users/josho/SofritoStudio/deploy/index.html', 'r') as f:
    content = f.read()

old_block = content[content.find('<script type="application/ld+json">'):content.find('</script>', content.find('<script type="application/ld+json">'))+9]

new_block = '''<script type="application/ld+json" id="structured-data">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Sofrito Studio — La Mesa Boricua",
    "image": [
      "https://sofritostudio.com/images/hero-mesa.webp",
      "https://sofritostudio.com/images/mockup-cookbook.svg"
    ],
    "description": "30 authentic Puerto Rican recipes — bilingual, tested, and built for mainland kitchens. No culinary degree required.",
    "sku": "mesa-001",
    "brand": {
      "@type": "Organization",
      "name": "Sofrito Studio",
      "url": "https://sofritostudio.com",
      "logo": "https://sofritostudio.com/images/logo.svg"
    },
    "offers": {
      "@type": "Offer",
      "price": "47.00",
      "priceCurrency": "USD",
      "priceValidUntil": "2026-12-31",
      "availability": "https://schema.org/InStock",
      "url": "https://sofritostudio.com/products/la-mesa-boricua-sales.html",
      "hasMerchantReturnPolicy": {
        "@type": "MerchantReturnPolicy",
        "returnMethod": "https://schema.org/ReturnByMail",
        "returnFees": "https://schema.org/FreeReturn",
        "returnPolicyCategory": "https://schema.org/MoneyBackOrExchangeOnly",
        "applicableCountry": "US",
        "returnWindow": "P30D"
      },
      "shippingDetails": {
        "@type": "OfferShippingDetails",
        "shippingRate": {
          "@type": "MonetaryAmount",
          "value": "0.00",
          "currency": "USD"
        },
        "deliveryTime": {
          "@type": "ShippingDeliveryTime",
          "handlingTime": {
            "@type": "QuantitativeValue",
            "minValue": "0",
            "maxValue": "0",
            "unitCode": "DAY"
          },
          "transitTime": {
            "@type": "QuantitativeValue",
            "minValue": "0",
            "maxValue": "0",
            "unitCode": "DAY"
          }
        }
      }
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "reviewCount": "127"
    }
  }
  </script>'''

content = content.replace(old_block, new_block)
with open('C:/Users/josho/SofritoStudio/deploy/index.html', 'w') as f:
    f.write(content)
print('JSON-LD replaced with complete Product schema')
