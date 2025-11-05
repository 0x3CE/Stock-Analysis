import yfinance as yf

# Remplace "IREN" par n'importe quel ticker pour tester
ticker_symbol = "NVDA"

# Crée l'objet Ticker
stock = yf.Ticker(ticker_symbol)

# Récupération des informations principales
info = stock.info
fast_info = getattr(stock, "fast_info", {})
history = stock.history(period="5d")
financials = stock.financials

print("=== INFO ===")
print(info)
