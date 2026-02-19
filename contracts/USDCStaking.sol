// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract USDCStaking {
    IERC20 public usdc;
    address public owner;

    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 claimed;
    }

    mapping(address => Stake) public stakes;
    uint256 public totalStaked;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 reward);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
        owner = msg.sender;
    }

    function stake(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        if (stakes[msg.sender].amount > 0) {
            _claimRewards(msg.sender);
        }
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        stakes[msg.sender].amount += amount;
        stakes[msg.sender].startTime = block.timestamp;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake() external {
        Stake storage s = stakes[msg.sender];
        require(s.amount > 0, "Nothing staked");
        uint256 reward = pendingReward(msg.sender);
        uint256 amount = s.amount;
        s.amount = 0;
        s.startTime = 0;
        s.claimed = 0;
        totalStaked -= amount;
        require(usdc.transfer(msg.sender, amount + reward), "Transfer failed");
        emit Unstaked(msg.sender, amount);
        if (reward > 0) emit RewardClaimed(msg.sender, reward);
    }

    function claimRewards() external {
        require(stakes[msg.sender].amount > 0, "Nothing staked");
        _claimRewards(msg.sender);
    }

    function _claimRewards(address user) internal {
        uint256 reward = pendingReward(user);
        if (reward > 0) {
            stakes[user].claimed += reward;
            stakes[user].startTime = block.timestamp;
            require(usdc.transfer(user, reward), "Reward transfer failed");
            emit RewardClaimed(user, reward);
        }
    }

    function pendingReward(address user) public view returns (uint256) {
        Stake memory s = stakes[user];
        if (s.amount == 0) return 0;
        uint256 elapsed = block.timestamp - s.startTime;
        return (s.amount * elapsed * 10) / (365 days * 100);
    }

    function fundRewards(uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    function getStake(address user) external view returns (
        uint256 amount,
        uint256 startTime,
        uint256 pending
    ) {
        return (
            stakes[user].amount,
            stakes[user].startTime,
            pendingReward(user)
        );
    }
}
