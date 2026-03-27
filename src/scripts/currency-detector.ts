// Client-side currency detection and price updating

type Currency = 'EUR' | 'PLN';

function detectUserCurrency(): Currency {
    // Try to detect from browser's locale
    const locale = navigator.language || (navigator as any).userLanguage;
    
    // Polish locales
    if (locale && locale.toLowerCase().startsWith('pl')) {
        return 'PLN';
    }

    // Try to detect from timezone
    try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        // Polish timezones
        if (timezone && timezone.includes('Warsaw')) {
            return 'PLN';
        }
    } catch (e) {
        // Timezone detection failed
    }

    // Default to EUR
    return 'EUR';
}

function updatePrices() {
    const currency = detectUserCurrency();
    
    // Find all price elements with data attributes
    const priceElements = document.querySelectorAll('[data-price-eur][data-price-pln]');
    
    priceElements.forEach((element) => {
        const priceEUR = element.getAttribute('data-price-eur');
        const pricePLN = element.getAttribute('data-price-pln');
        
        if (!priceEUR || !pricePLN) return;
        
        if (currency === 'PLN') {
            element.textContent = `${pricePLN}zł`;
        } else {
            element.textContent = `€${priceEUR}`;
        }
    });

    // Update enroll button text
    const enrollButtons = document.querySelectorAll('[data-enroll-eur][data-enroll-pln]');
    
    enrollButtons.forEach((button) => {
        const priceEUR = button.getAttribute('data-enroll-eur');
        const pricePLN = button.getAttribute('data-enroll-pln');
        
        if (!priceEUR || !pricePLN) return;
        
        const span = button.querySelector('span');
        if (span) {
            if (currency === 'PLN') {
                span.textContent = `Enroll Now for ${pricePLN}zł`;
            } else {
                span.textContent = `Enroll Now for €${priceEUR}`;
            }
        }
    });
}

// Run on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updatePrices);
} else {
    updatePrices();
}

// Export for use in other scripts
export { detectUserCurrency, updatePrices };
