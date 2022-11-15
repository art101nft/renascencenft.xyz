const contractAddress = '0x501a31185927136E87cDfC97dDd4553D8eC1bb4A'; // mainnet
const chainId = '1'; // mainnet
const w3 = new Web3(Web3.givenProvider || "http://127.0.0.1:7545");

window.addEventListener('DOMContentLoaded', async () => {
  if (!window.ethereum || !window.ethereum.selectedAddress || !window.ethereum.isMetaMask) {
    const btn = $('#connectButton');
    btn.removeClass('hidden');
    btn.click(async function (){
    // Offer to install MetaMask if it's not installed nor do we detect a replacement such as Coinbase wallet
    const onboarding = new MetaMaskOnboarding();
    if (!MetaMaskOnboarding.isMetaMaskInstalled() && !window.ethereum) {
        alert('This site requires a browser wallet addon, such as Coinbase wallet or MetaMask. Redirecting you to a page to download MetaMask.');
        await onboarding.startOnboarding();
    } else {
        await onboarding.stopOnboarding();
        const res = await getWalletAddress();
        if (res) btn.addClass('hidden');
        handleEthereum();
    }
    });
  } else {
    handleEthereum()
  }
});

async function handleEthereum() {
  // refresh page if changing wallets
  window.ethereum.on('accountsChanged', async function (accounts) {
    // window.location.href = '';
    handleEthereum();
  });
  // unhide refresh link
  $('#refresh').removeClass('hidden');
  // update mint message/status when clicking refresh
  $('#refresh').click(async function () {
    await updateMintStatus();
  });
  // update mint message/status now and every 10 seconds
  await updateMintStatus();
  let _i = setInterval(updateMintStatus, 10000);
  // Calculate mint values on form input
  let timeout = null;
  $('input').on('input', function(){
    clearTimeout(timeout);
    timeout = setTimeout(function () {
      const mintPriceEther = $('#mintPriceEther').val();
      const numberOfTokens = $('#numberOfTokens').val();
      if (isNaN(mintPriceEther) || isNaN(numberOfTokens)) return false;
      const mintPriceWei = w3.utils.toWei(mintPriceEther);
      const mintValueWei = mintPriceWei * numberOfTokens;
      const mintValueEther = w3.utils.fromWei(mintValueWei.toString());
      $('.totalValue').html(`(~${mintValueEther} Ξ)`)
    });
  });
  // hide form and stop refreshing message/status
  $('.mintButton').on('click', async function (){
    const mintPriceEther = $('#mintPriceEther').val();
    $('#mintForm').addClass('hidden');
    clearInterval(_i);
    await _mint(mintPriceEther, true);
  });
}

async function switchNetwork(){
  // don't do this if no metamask (errors on coinbase wallet)
  if (!MetaMaskOnboarding.isMetaMaskInstalled()) {
    return false;
  }
  await ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: `0x${chainId}` }],
  });
}

async function getWalletAddress() {
  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts',
  });
  const account = accounts[0];
  return account;
}

async function updateMintStatus() {
  $('#loading').removeClass('hidden');
  const walletAddress = await getWalletAddress();
  const walletShort = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
  const contract = new w3.eth.Contract(contractABI, contractAddress, {from: walletAddress});
  const currentSupply = await contract.methods.totalSupply().call();
  const maxSupply = await contract.methods.maxSupply().call();
  const maxMints = await contract.methods.maxMint().call();
  const maxWallet = await contract.methods.maxWallet().call();
  const publicBalance = await contract.methods.publicBalance(walletAddress).call();
  const mintingIsActive = await contract.methods.mintingIsActive().call();
  const balance = await contract.methods.balanceOf(walletAddress).call();
  const mintedOut = currentSupply == maxSupply;
  if (mintedOut) {
    $('#mintMessage').html(`That's all folks, supply is minted out! Check secondary markets to purchase an NFT-isse.<br><br><a href="https://opensea.io/collection/renascencenft" target=_blank>Opensea</a>`);
    $('#loading').addClass('hidden');
    return
  }
  if (!mintingIsActive) {
    $('#mintMessage').html(`Minting is not active yet! Check back later.<h2><b>${currentSupply} / ${maxSupply} minted</b></h2><div style="margin-top: 8px"></div>`);
  } else {
    let d = 0;
    $('#mintMessage').html(`Public minting is live! Limit ${maxMints} per transaction. Max ${maxMints} per wallet. </br>You have ${publicBalance}/${maxMints} public mints, and ${balance} total in your wallet.</br><div style="margin-top: 8px"></div><h2><b>${currentSupply} / ${maxSupply} minted.</b></h2><div style="margin-top: 8px"></div>`);
    $('#mintForm').removeClass('hidden');
    $('.mintButton').removeClass('hidden');
  }
  $('#loading').addClass('hidden');
}

async function _mint(mintPrice, isPublic) {
  try {
    await mint(mintPrice, isPublic);
  } catch(e) {
    $('#mintMessage').html(`${e.message} - refresh and try again`);
    return false;
  }
}

async function mint(mintPrice, isPublic) {
  let etherscan_uri = 'etherscan.io';
  let opensea_uri = 'opensea.io';
  if (window.ethereum.chainId == "0x5") {
    etherscan_uri = 'goerli.etherscan.io';
    opensea_uri = 'testnets.opensea.io';
  }
  let res;
  let gasLimit;
  const walletAddress = await getWalletAddress();
  const walletShort = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
  const gasPrice = await w3.eth.getGasPrice();
  let amountToMint = $('#numberOfTokens').val();
  if (amountToMint <= 0 || isNaN(amountToMint)) {
    amountToMint = 1;
    $('#numberOfTokens').val(amountToMint);
  }
  // Figure out value to send if user opting to send ETH
  const mintPriceWei = w3.utils.toWei(mintPrice);
  const mintValueWei = mintPriceWei * amountToMint;
  const mintValueEther = w3.utils.fromWei(mintValueWei.toString());
  // Define the contract we want to use
  const contract = new w3.eth.Contract(contractABI, contractAddress, {from: walletAddress});
  // Fail if sales are paused
  const mintingIsActive = await contract.methods.mintingIsActive().call();
  if (!mintingIsActive) {
    $('#mintMessage').html(`Sales are currently paused on this contract. Try again later.`);
    return false;
  }
  // Fail if requested amount would exceed supply
  let currentSupply = await contract.methods.totalSupply().call();
  let maxSupply = await contract.methods.maxSupply().call();
  if (Number(currentSupply) + Number(amountToMint) > Number(maxSupply)) {
    $('#mintMessage').html(`Requesting ${amountToMint} would exceed the maximum token supply of ${maxSupply}. Current supply is ${currentSupply}, so try minting ${maxSupply - currentSupply}.`)
    return false;
  }
  // Show loading icon
  $('#mintForm').addClass('hidden');
  $('#loading').removeClass('hidden');

  if (isPublic) {
    await contract.methods.mintPublic(amountToMint).estimateGas({from: walletAddress}, function(err, gas){
      gasLimit = gas;
    });
    $('#mintMessage').html(`Attempting to mint ${amountToMint} tokens for ${Number(w3.utils.fromWei((gasLimit * gasPrice + mintValueWei).toString())).toFixed(5)} Ξ to wallet <b>${walletShort}</b>`);
    res = await contract.methods.mintPublic(amountToMint).send({
      from: walletAddress,
      gasPrice: gasPrice,
      gas: gasLimit,
      value: mintValueWei
    });
  }


  $('#loading').addClass('hidden');
  if (res.status) {
    $('#mintMessage').html(`Success! Head to <a target=_blank href="https://${opensea_uri}/account?search[resultModel]=ASSETS&search[sortBy]=LAST_TRANSFER_DATE&search[sortAscending]=false">OpenSea</a> to see your NFTs!<br><br><a target=_blank href="https://${etherscan_uri}/tx/${res.transactionHash}">Etherscan</a>`);
  } else {
    // $('#mintMessage').html(`Failed. ${res}`);
    throw new Error(`Transaction failed: ${res}`)
  }
}
