import { useNavigate } from 'react-router-dom';

function AssetCard({ asset }) {
  const navigate = useNavigate();

  const change24hRaw = Number(asset?.change24h);
  const change24h = Number.isFinite(change24hRaw) ? change24hRaw : 0;
  const priceRaw = Number(asset?.price);
  const price = Number.isFinite(priceRaw) ? priceRaw : 0;

  const quoteCurrency = typeof asset?.quoteCurrency === 'string' ? asset.quoteCurrency : '';
  const isFxCard = asset?.type === 'currency' && quoteCurrency;

  const openAsset = () => {
    const type = String(asset?.type || '').toLowerCase();
    const id = encodeURIComponent(String(asset?.id || ''));
    navigate(`/asset/${type}/${id}`);
  };

  return (
    <article
      className="asset-card"
      role="button"
      tabIndex={0}
      onClick={openAsset}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openAsset();
        }
      }}
    >
      <header>
        <div>
          <h3>{asset.name}</h3>
          <div className="asset-meta">
            {asset.symbol.toUpperCase()} • {asset.type}
          </div>
        </div>
        <div className={`price ${change24h >= 0 ? 'positive' : 'negative'}`}>
          {change24h >= 0 ? '+' : ''}
          {change24h.toFixed(2)}%
        </div>
      </header>

      <div>
        <div className="asset-meta">Current price</div>
        <div className="price">
          {isFxCard
            ? `${price.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${quoteCurrency.toUpperCase()}`
            : `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
        </div>
      </div>

      <button
        type="button"
        className="secondary-button"
        onClick={(event) => {
          event.stopPropagation();
          openAsset();
        }}
      >
        Open
      </button>
    </article>
  );
}

export default AssetCard;