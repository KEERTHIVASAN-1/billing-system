import React, { useState, useEffect } from "react";
import "./index.css";

export default function App() {
  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState("");
  const [customer, setCustomer] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });
  const [products, setProducts] = useState([
    { description: "", quantity: "", price: "", total: 0 },
  ]);
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const [discount, setDiscount] = useState("");
  const [advance, setAdvance] = useState("");
  const [finalTotal, setFinalTotal] = useState(0);

  useEffect(() => {
    setDate(new Date().toLocaleDateString());
  }, []);

  useEffect(() => {
    let subtotal = products.reduce(
      (acc, item) => acc + (item.quantity * item.price || 0),
      0
    );
    let total = subtotal + Number(deliveryCharge || 0) - Number(discount || 0);
    setFinalTotal(total - Number(advance || 0));
  }, [products, deliveryCharge, discount, advance]);

  const handleProductChange = (index, field, value) => {
    const newProducts = [...products];
    newProducts[index][field] = value;
    newProducts[index].total =
      (newProducts[index].quantity || 0) * (newProducts[index].price || 0);
    setProducts(newProducts);
  };

  const addProduct = () => {
    setProducts([...products, { description: "", quantity: "", price: "", total: 0 }]);
  };

  const removeProduct = (index) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const handleGeneratePDF = async () => {
    if (!invoiceNo.trim()) {
      alert("Please enter an Invoice Number before generating the bill.");
      return;
    }

    const billData = {
      invoiceNo,
      date,
      customer,
      products,
      deliveryCharge,
      discount,
      advance,
      finalTotal,
    };

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/generate-bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(billData),
      });
      
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `Bill_${invoiceNo}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      alert("Bill downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating PDF. Please try again.");
    }
  };

  return (
    <div className="invoice-container">
      <header className="invoice-header">
  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
    <img
      src="/egroots-logo.png"
      alt="E-GROOTS Logo"
      style={{ width: "60px", height: "60px", objectFit: "contain" }}
    />

    <h1 className="title">
      Billing Software <span className="brand">E-GROOTS</span>
    </h1>
  </div>

  <div className="invoice-info">
    <label>
      <strong>Invoice No:</strong>
      <input
        type="text"
        placeholder="Enter Invoice Number"
        value={invoiceNo}
        onChange={(e) => setInvoiceNo(e.target.value)}
      />
    </label>
    <p><strong>Date:</strong> {date}</p>
  </div>
</header>


      <section className="customer-section">
        <h2>Customer Details</h2>
        <div className="form-grid">
          <input
            type="text"
            placeholder="Customer Name"
            value={customer.name}
            onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
          />
          <input
            type="text"
            placeholder="Address"
            value={customer.address}
            onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
          />
          <input
            type="text"
            placeholder="Phone"
            value={customer.phone}
            onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
          />
          <input
            type="email"
            placeholder="Email"
            value={customer.email}
            onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
          />
        </div>
      </section>

      <section className="product-section">
        <h2>Product Details</h2>
        <table className="product-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Price/Unit</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((item, index) => (
              <tr key={index}>
                <td><input type="text" value={item.description}
                  onChange={(e) => handleProductChange(index, "description", e.target.value)} /></td>
                <td><input type="number" value={item.quantity}
                  onChange={(e) => handleProductChange(index, "quantity", e.target.value)} /></td>
                <td><input type="number" value={item.price}
                  onChange={(e) => handleProductChange(index, "price", e.target.value)} /></td>
                <td>{item.total.toFixed(2)}</td>
                <td>{products.length > 1 && (
                  <button className="remove-btn" onClick={() => removeProduct(index)}>✕</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="add-btn" onClick={addProduct}>+ Add Product</button>
      </section>

      <section className="summary-section">
        <h2>Summary</h2>
        <div className="summary-grid">
          <input type="number" placeholder="Delivery Charge"
            value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} />
          <input type="number" placeholder="Discount"
            value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <input type="number" placeholder="Advance"
            value={advance} onChange={(e) => setAdvance(e.target.value)} />
        </div>
        <h3>Final Total: ₹ {finalTotal.toFixed(2)}</h3>
      </section>

      <footer className="footer">
        <button className="download-btn" onClick={handleGeneratePDF}>
          Generate & Download Bill
        </button>
      </footer>
    </div>
  );
}
